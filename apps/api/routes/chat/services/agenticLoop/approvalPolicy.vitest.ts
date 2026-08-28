import { describe, it, expect, afterEach } from 'vitest';

import { approvalScopeKey, evaluateApproval, toolApprovalMode } from './approvalPolicy.js';
import { createToolApprovalGate, DENIED_RETRY_MESSAGE } from './toolApprovalGate.js';

import type { ToolOrigin } from './types.js';

const mcpOrigin: ToolOrigin = {
  kind: 'mcp',
  serverId: '11111111-2222-3333-4444-555555555555',
  remoteToolName: 'create_page',
};
const managedOrigin: ToolOrigin = {
  kind: 'managed',
  serverId: 'bahn',
  remoteToolName: 'timetable',
};

const empty = new Set<string>();

describe('approvalScopeKey', () => {
  it('trennt verbundene, betriebene und interne Werkzeuge', () => {
    expect(approvalScopeKey('m11111111__create_page', mcpOrigin)).toBe(
      'mcp:11111111-2222-3333-4444-555555555555/create_page'
    );
    expect(approvalScopeKey('bahn__timetable', managedOrigin)).toBe('managed:bahn/timetable');
    expect(approvalScopeKey('web_search', null)).toBe('internal/web_search');
  });

  it('hängt am Server, nicht am gekürzten Namensraum-Präfix', () => {
    // Das Präfix ist auf 8 Zeichen gekürzt; zwei Server könnten kollidieren.
    const other: ToolOrigin = { ...mcpOrigin, serverId: '11111111-9999-0000-0000-000000000000' };
    expect(approvalScopeKey('m11111111__create_page', mcpOrigin)).not.toBe(
      approvalScopeKey('m11111111__create_page', other)
    );
  });
});

describe('evaluateApproval', () => {
  it('fragt bei Konnektor-Werkzeugen, auch bei den betriebenen', () => {
    for (const origin of [mcpOrigin, managedOrigin]) {
      const verdict = evaluateApproval({
        toolName: 'x',
        origin,
        allowlist: empty,
        flagEnabled: true,
      });
      expect(verdict.required).toBe(true);
    }
  });

  it('lässt interne Werkzeuge durch', () => {
    const verdict = evaluateApproval({
      toolName: 'web_search',
      origin: null,
      allowlist: empty,
      flagEnabled: true,
    });
    expect(verdict).toEqual({ required: false, reason: 'internal' });
  });

  it('fragt nicht doppelt, wo confirm_action schon fragt', () => {
    const verdict = evaluateApproval({
      toolName: 'documents',
      origin: null,
      allowlist: empty,
      flagEnabled: true,
    });
    expect(verdict).toEqual({ required: false, reason: 'confirm_action_gated' });
  });

  it('respektiert die dauerhafte Freigabe', () => {
    const allowlist = new Set([approvalScopeKey('x', mcpOrigin)]);
    const verdict = evaluateApproval({
      toolName: 'x',
      origin: mcpOrigin,
      allowlist,
      flagEnabled: true,
    });
    expect(verdict).toEqual({ required: false, reason: 'allowlisted' });
  });

  it('ist ohne Schalter vollständig aus', () => {
    const verdict = evaluateApproval({
      toolName: 'x',
      origin: mcpOrigin,
      allowlist: empty,
      flagEnabled: false,
    });
    expect(verdict).toEqual({ required: false, reason: 'flag_off' });
  });
});

describe('createToolApprovalGate', () => {
  const gateFor = (over: Partial<Parameters<typeof createToolApprovalGate>[0]> = {}) =>
    createToolApprovalGate({
      mode: 'enforce',
      allowlist: empty,
      originFor: () => mcpOrigin,
      ...over,
    });

  it('hält den Aufruf zurück und bricht den Zug ab', () => {
    const gate = gateFor();
    expect(gate.signal.aborted).toBe(false);
    expect(gate.decide({ toolName: 'x', stepId: 'c1', args: { a: 1 } })).toEqual({ kind: 'hold' });
    expect(gate.signal.aborted).toBe(true);
    expect(gate.pending()).toHaveLength(1);
    expect(gate.pending()[0]).toMatchObject({ toolCallId: 'c1', toolName: 'x', args: { a: 1 } });
  });

  it('sammelt parallele Geschwister desselben Model-Steps ein', () => {
    const gate = gateFor();
    gate.decide({ toolName: 'x', stepId: 'c1', args: {} });
    gate.decide({ toolName: 'y', stepId: 'c2', args: {} });
    expect(gate.pending().map((c) => c.toolCallId)).toEqual(['c1', 'c2']);
  });

  it('verbraucht eine Einmal-Freigabe genau einmal', () => {
    const scopeKey = approvalScopeKey('x', mcpOrigin);
    const gate = gateFor({ grantedOnce: new Map([[scopeKey, 1]]) });
    expect(gate.decide({ toolName: 'x', stepId: 'c1', args: {} })).toEqual({ kind: 'allow' });
    expect(gate.decide({ toolName: 'x', stepId: 'c2', args: {} })).toEqual({ kind: 'hold' });
  });

  it('hält gar nichts zurück, solange der Schalter aus ist', () => {
    const gate = gateFor({ mode: 'off' });
    expect(gate.decide({ toolName: 'x', stepId: 'c1', args: {} })).toEqual({ kind: 'allow' });
    expect(gate.hasPending()).toBe(false);
  });

  describe('nach einer Ablehnung', () => {
    const scopeKey = approvalScopeKey('x', mcpOrigin);

    it('verweigert den erneuten Aufruf, ohne ein zweites Mal zu fragen', () => {
      const gate = gateFor({ deniedScopeKeys: new Set([scopeKey]) });
      const decision = gate.decide({ toolName: 'x', stepId: 'c9', args: {} });
      expect(decision.kind).toBe('refuse');
      // Der Zug darf davon NICHT abbrechen — sonst ist die Schleife nur eine
      // Ebene tiefer gewandert.
      expect(gate.signal.aborted).toBe(false);
      expect(gate.hasPending()).toBe(false);
    });

    it('nennt dem Modell ausdrücklich, dass es nicht erneut versuchen soll', () => {
      const gate = gateFor({ deniedScopeKeys: new Set([scopeKey]) });
      const decision = gate.decide({ toolName: 'x', stepId: 'c9', args: {} });
      expect(decision.kind === 'refuse' && decision.modelMessage).toBe(DENIED_RETRY_MESSAGE);
      expect(DENIED_RETRY_MESSAGE).toMatch(/NICHT erneut/);
    });

    it('gilt auch für eine umformulierte Wiederholung — die Ablehnung hängt am scopeKey', () => {
      const gate = gateFor({ deniedScopeKeys: new Set([scopeKey]) });
      expect(gate.decide({ toolName: 'x', stepId: 'c9', args: { text: 'anders' } }).kind).toBe(
        'refuse'
      );
    });

    it('bindet nur den abgelehnten scopeKey, nicht die übrigen Werkzeuge', () => {
      const gate = gateFor({ deniedScopeKeys: new Set(['mcp:andere/tool']) });
      expect(gate.decide({ toolName: 'x', stepId: 'c9', args: {} })).toEqual({ kind: 'hold' });
    });

    it('eine Einmal-Freigabe sticht die Ablehnung — sie ist die jüngere Entscheidung', () => {
      const gate = gateFor({
        grantedOnce: new Map([[scopeKey, 1]]),
        deniedScopeKeys: new Set([scopeKey]),
      });
      expect(gate.decide({ toolName: 'x', stepId: 'c1', args: {} })).toEqual({ kind: 'allow' });
      expect(gate.decide({ toolName: 'x', stepId: 'c2', args: {} }).kind).toBe('refuse');
    });
  });

  describe('Schattenbetrieb', () => {
    it('lässt den Aufruf durch, obwohl er freigabepflichtig wäre', () => {
      const gate = gateFor({ mode: 'shadow' });
      expect(gate.decide({ toolName: 'x', stepId: 'c1', args: {} })).toEqual({ kind: 'allow' });
      expect(gate.signal.aborted).toBe(false);
      expect(gate.hasPending()).toBe(false);
    });
  });
});

describe('toolApprovalMode', () => {
  const before = process.env.CHAT_TOOL_APPROVAL;
  afterEach(() => {
    if (before === undefined) delete process.env.CHAT_TOOL_APPROVAL;
    else process.env.CHAT_TOOL_APPROVAL = before;
  });

  it.each([
    ['true', 'enforce'],
    ['shadow', 'shadow'],
    ['SHADOW', 'shadow'],
    ['false', 'off'],
    ['', 'off'],
  ])('%s ⇒ %s', (raw, expected) => {
    process.env.CHAT_TOOL_APPROVAL = raw;
    expect(toolApprovalMode()).toBe(expected);
  });

  it('ohne gesetzte Variable aus', () => {
    delete process.env.CHAT_TOOL_APPROVAL;
    expect(toolApprovalMode()).toBe('off');
  });
});
