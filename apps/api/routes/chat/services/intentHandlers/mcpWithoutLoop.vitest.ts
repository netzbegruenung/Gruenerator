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

  it('nennt den zweiten Intent, wenn er der greifende Schalter ist', () => {
    sse.send.mockClear();
    reportMcpWithoutLoop(sse as never, state({ secondaryIntent: 'image' }), false);
    expect(warningOf().message).toContain('zweite Absicht');
  });

  // Der haeufigste Weg aus der Schleife: `mcp` traegt die Disposition `gated`,
  // steht also nicht in `NO_RETRIEVAL_VERDICTS` — ein eingefuegter Link setzt
  // `scrape_url` als zweiten Intent, ohne dass die Person etwas Zweites gefragt
  // haette. „Weiteres separat fragen" waere hier ein Rat ins Leere.
  it('nennt den eingefügten Link, statt ihn als zweite Absicht auszugeben', () => {
    sse.send.mockClear();
    const s = state({ secondaryIntent: 'scrape_url' });
    reportMcpWithoutLoop(sse as never, s, false);

    const { message } = warningOf();
    expect(message).toContain('Link');
    expect(message).not.toContain('zweite Absicht');
    expect(s.degradationNotes?.[0]?.modelHint).toContain('Link weglassen');
  });

  // Die Kurzschluss-Kette in `decideRunAgentic` nennt den ersten greifenden
  // Schalter, aber abgewiesen wird der Turn von ALLEN. Nennte die Meldung nur
  // einen, befolgte die Person den Rat und flöge erneut raus.
  it('nennt alle greifenden Schalter, nicht nur den ersten', () => {
    sse.send.mockClear();
    const s = state({ isCompound: true, secondaryIntent: 'image' });
    reportMcpWithoutLoop(sse as never, s, true);

    const { message } = warningOf();
    expect(message).toContain('Wissenssammlung');
    expect(message).toContain('zweite Absicht');
    expect(message).toContain('Bildanhänge');
    // Auch die Abhilfen vollständig — eine allein löst den Turn nicht.
    expect(s.degradationNotes?.[0]?.modelHint).toContain('allgemeinen Chat');
    expect(s.degradationNotes?.[0]?.modelHint).toContain('Bild entfernen');
  });

  // Erreicht heute niemand; der Zweig hält eine künftige vierte Sperre davon
  // ab, still als „zweite Absicht" zu erscheinen.
  it('rät nicht ins Blaue, wenn kein bekannter Schalter greift', () => {
    sse.send.mockClear();
    reportMcpWithoutLoop(sse as never, state(), false);

    const { message } = warningOf();
    expect(message).toContain('Einzeldurchlauf');
    expect(message).not.toContain('zweite Absicht');
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
