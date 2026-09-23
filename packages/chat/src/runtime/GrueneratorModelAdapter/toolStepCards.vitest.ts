import { describe, expect, it } from 'vitest';

import {
  applyToolStepResult,
  buildToolStepCard,
  toolStepResultMessage,
  toolStepTitle,
} from './toolStepCards';

describe('toolStepTitle', () => {
  it('prefers the server title', () => {
    expect(toolStepTitle({ stepId: 's', toolName: 'notebook_quellen', title: 'Lese Quelle' })).toBe(
      'Lese Quelle'
    );
  });

  it('labels the legacy mcp_tool by server and tool', () => {
    expect(
      toolStepTitle({
        stepId: 's',
        toolName: 'mcp_tool',
        args: { server: 'Notion', tool: 'search' },
      })
    ).toBe('Notion · search');
    expect(toolStepTitle({ stepId: 's', toolName: 'mcp_tool' })).toBe('MCP');
  });

  it('uses the fixed map, then the namespaced label', () => {
    expect(toolStepTitle({ stepId: 's', toolName: 'rezept_laden' })).toBe('Lade Schreibvorgaben…');
    expect(toolStepTitle({ stepId: 's', toolName: 's0__search', serverName: 'Notion' })).toBe(
      'Notion · search…'
    );
  });
});

describe('buildToolStepCard', () => {
  it('builds a result-less card keyed by stepId, the title riding in args.query', () => {
    const card = buildToolStepCard(
      { stepId: 'step-1', toolName: 'notebook_quellen', args: { action: 'list' } },
      'Quellen',
      'Ich sehe mir die Liste an.'
    );
    expect(card).toEqual({
      type: 'tool-call',
      toolCallId: 'step-1',
      toolName: 'notebook_quellen',
      args: { query: 'Quellen', action: 'list' },
      argsText: JSON.stringify({ query: 'Quellen', action: 'list' }),
      narration: 'Ich sehe mir die Liste an.',
    });
  });

  it('leaves narration off when there is none', () => {
    const card = buildToolStepCard({ stepId: 'x', toolName: 't' }, 'T');
    expect('narration' in card).toBe(false);
  });
});

describe('applyToolStepResult', () => {
  const card = buildToolStepCard({ stepId: 'x', toolName: 't' }, 'T');

  it('returns a new card with the result, ok and summary folded in', () => {
    const next = applyToolStepResult(card, {
      stepId: 'x',
      toolName: 't',
      ok: true,
      summary: '3 Treffer',
      result: { hits: 3 },
    });
    expect(next).not.toBe(card);
    expect(next.result).toEqual({ hits: 3, ok: true, summary: '3 Treffer' });
    expect(card.result).toBeUndefined();
  });

  it('lifts a ui:// widget pointer onto mcp.app', () => {
    const next = applyToolStepResult(card, {
      stepId: 'x',
      toolName: 't',
      ok: true,
      result: { uiResource: { uri: 'ui://widget/1', mimeType: 'text/html' } },
    });
    expect(next.mcp).toEqual({ app: { resourceUri: 'ui://widget/1', mimeType: 'text/html' } });
  });

  it('ignores a non-ui:// resource', () => {
    const next = applyToolStepResult(card, {
      stepId: 'x',
      toolName: 't',
      ok: false,
      result: { uiResource: { uri: 'https://example.org' } },
    });
    expect(next.mcp).toBeUndefined();
    expect(next.result).toMatchObject({ ok: false });
  });
});

describe('toolStepResultMessage', () => {
  it('uses the summary, else an ok/failed default', () => {
    expect(toolStepResultMessage({ stepId: 'x', toolName: 't', ok: true, summary: 'S' })).toBe('S');
    expect(toolStepResultMessage({ stepId: 'x', toolName: 't', ok: true })).toBe(
      'Änderung angewendet'
    );
    expect(toolStepResultMessage({ stepId: 'x', toolName: 't', ok: false })).toBe(
      'Schritt fehlgeschlagen'
    );
  });
});
