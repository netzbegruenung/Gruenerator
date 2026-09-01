import { describe, it, expect } from 'vitest';

import { approvalScopeKey, evaluateApproval } from './approvalPolicy.js';
import { createToolApprovalGate } from './toolApprovalGate.js';

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

  it('erlässt die Frage bei einem betriebenen Werkzeug, das nur liest', () => {
    const verdict = evaluateApproval({
      toolName: 'bahn__timetable',
      origin: { ...managedOrigin, readOnlyHint: true },
      allowlist: empty,
      flagEnabled: true,
    });
    expect(verdict).toEqual({ required: false, reason: 'managed_read_only' });
  });

  it('glaubt denselben Hinweis einem fremden Server nicht', () => {
    // Der Kern der Sache: ein per URL eingefügter Server darf sich sein eigenes
    // Gatter nicht abschalten können, egal was er annotiert.
    const verdict = evaluateApproval({
      toolName: 'm11111111__create_page',
      origin: { ...mcpOrigin, readOnlyHint: true },
      allowlist: empty,
      flagEnabled: true,
    });
    expect(verdict.required).toBe(true);
  });

  it('fragt weiter, wenn der Hinweis fehlt oder false ist', () => {
    // Fehlend heisst „nichts gesagt", nicht „nein" — beides bleibt beim Status quo.
    for (const readOnlyHint of [undefined, false]) {
      const verdict = evaluateApproval({
        toolName: 'bahn__timetable',
        origin: { ...managedOrigin, ...(readOnlyHint != null ? { readOnlyHint } : {}) },
        allowlist: empty,
        flagEnabled: true,
      });
      expect(verdict.required).toBe(true);
    }
  });

  it('lässt den Schalter über allem stehen', () => {
    const verdict = evaluateApproval({
      toolName: 'bahn__timetable',
      origin: { ...managedOrigin, readOnlyHint: true },
      allowlist: empty,
      flagEnabled: false,
    });
    expect(verdict).toEqual({ required: false, reason: 'flag_off' });
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
      enabled: true,
      allowlist: empty,
      originFor: () => mcpOrigin,
      ...over,
    });

  it('hält den Aufruf zurück und bricht den Zug ab', () => {
    const gate = gateFor();
    expect(gate.signal.aborted).toBe(false);
    expect(gate.hold({ toolName: 'x', stepId: 'c1', args: { a: 1 } })).toBe(true);
    expect(gate.signal.aborted).toBe(true);
    expect(gate.pending()).toHaveLength(1);
    expect(gate.pending()[0]).toMatchObject({ toolCallId: 'c1', toolName: 'x', args: { a: 1 } });
  });

  it('sammelt parallele Geschwister desselben Model-Steps ein', () => {
    const gate = gateFor();
    gate.hold({ toolName: 'x', stepId: 'c1', args: {} });
    gate.hold({ toolName: 'y', stepId: 'c2', args: {} });
    expect(gate.pending().map((c) => c.toolCallId)).toEqual(['c1', 'c2']);
  });

  it('verbraucht eine Einmal-Freigabe genau einmal', () => {
    const scopeKey = approvalScopeKey('x', mcpOrigin);
    const gate = gateFor({ grantedOnce: new Map([[scopeKey, 1]]) });
    expect(gate.hold({ toolName: 'x', stepId: 'c1', args: {} })).toBe(false);
    expect(gate.hold({ toolName: 'x', stepId: 'c2', args: {} })).toBe(true);
  });

  it('hält gar nichts zurück, solange der Schalter aus ist', () => {
    const gate = gateFor({ enabled: false });
    expect(gate.hold({ toolName: 'x', stepId: 'c1', args: {} })).toBe(false);
    expect(gate.hasPending()).toBe(false);
  });
});
