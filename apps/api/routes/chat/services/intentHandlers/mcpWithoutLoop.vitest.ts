import { describe, expect, it, vi } from 'vitest';

import { reportMcpWithoutLoop } from './mcpWithoutLoop.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

/**
 * Ein `mcp`-Turn, der es nicht in die Schleife schafft, hat dort keinen
 * Ausführenden — die Werkzeuge des gewählten Servers gibt es nur im Loop. Bis
 * 08/2026 lief er stumm als Antwort aus dem Gedächtnis weiter; der
 * Festhalte-Test in `turnPlan.vitest.ts` hielt nur fest, DASS er nicht
 * degradiert, nicht was die Person davon sieht.
 *
 * Diese Datei sagt, was er stattdessen tut: absagen und den Ausweg nennen.
 * Bewusst KEINE Umleitung auf `web` — eine Websuche ist eine andere Quelle als
 * der gemeinte Server, kein schwächeres Ergebnis derselben.
 */

const sse = { send: vi.fn(), isEnded: () => false };

const state = (over: Partial<ChatGraphState> = {}): ChatGraphState =>
  ({ intent: 'mcp', isCompound: false, ...over }) as ChatGraphState;

function warningOf(): { code: string; message: string } {
  const call = sse.send.mock.calls.find(([event]) => event === 'warning');
  if (!call) throw new Error('kein warning-Event gesendet');
  return call[1] as { code: string; message: string };
}

describe('reportMcpWithoutLoop', () => {
  it('warnt mit eigenem Code statt mit `mcp_unreachable`', () => {
    sse.send.mockClear();
    reportMcpWithoutLoop(sse as never, state(), true);
    expect(warningOf().code).toBe('mcp_not_consulted');
  });

  it('nennt beim Bildanhang den Anhang als Grund und seine Abhilfe', () => {
    sse.send.mockClear();
    const s = state();
    reportMcpWithoutLoop(sse as never, s, true);

    expect(warningOf().message).toContain('Bildanhänge');
    // Der Modell-Hinweis ist die zweite Hälfte: ohne ihn sagt die ANTWORT den
    // Grund nicht, und die Warnung allein liest sich wie eine Randnotiz.
    expect(s.degradationNotes?.[0]?.modelHint).toContain('Bildanhänge');
    expect(s.degradationNotes?.[0]?.modelHint).toContain('Bild entfernen');
  });

  it('nennt beim Verbund-Agenten die Wissenssammlung, nicht das Bild', () => {
    sse.send.mockClear();
    const s = state({ isCompound: true });
    reportMcpWithoutLoop(sse as never, s, false);

    expect(warningOf().message).toContain('Wissenssammlung');
    expect(warningOf().message).not.toContain('Bildanhänge');
  });

  it('fällt auf den zweiten Intent zurück, wenn weder Bild noch Verbund vorliegt', () => {
    sse.send.mockClear();
    reportMcpWithoutLoop(sse as never, state(), false);
    expect(warningOf().message).toContain('zweite Absicht');
  });

  it('hängt an bestehende Degradierungs-Notizen an, statt sie zu ersetzen', () => {
    sse.send.mockClear();
    const s = state({
      degradationNotes: [{ code: 'source_unavailable', modelHint: 'vorher' }],
    });
    reportMcpWithoutLoop(sse as never, s, true);

    expect(s.degradationNotes?.map((n) => n.code)).toEqual([
      'source_unavailable',
      'mcp_not_consulted',
    ]);
  });
});
