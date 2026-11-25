/**
 * Die Stil-Analyse aus Beispieltexten läuft über die Fassade (`aiObject`) auf
 * der Gemma-Lane `creator_draft` — nicht mehr direkt mit `generateObject` an
 * Mistral Large vorbei an Tabelle und Ausweichkette.
 *
 * Run with: cd apps/api && npx vitest run services/user/textFormAnalysisService.vitest.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAiObject = vi.fn();
vi.mock('../ai/generate.js', () => ({
  aiObject: (...args: unknown[]) => mockAiObject(...args),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { analyzeTextForm } = await import('./textFormAnalysisService.js');

const style = {
  tonality: 'Sachlich',
  sentenceStyle: 'Kurze Sätze',
  vocabulary: 'Verwaltungssprache',
  structure: 'Headline $\\rightarrow$ Forderung $\nightarrow$ Zitat',
  dos: ['Zahlen nennen'],
  donts: ['Lange Einleitungen'],
  signaturePhrases: ['Die Grüne Ratsfraktion beantragt'],
};

beforeEach(() => mockAiObject.mockReset());

describe('analyzeTextForm', () => {
  it('fragt die Gemma-Lane creator_draft mit erzwungenem Werkzeugaufruf', async () => {
    mockAiObject.mockResolvedValueOnce({ ok: true, data: style });

    await analyzeTextForm('Pressemitteilung', [{ content: 'Ein Beispiel.' }]);

    const call = mockAiObject.mock.calls[0]?.[0] as {
      lane: string;
      prompt: string;
      validate: (input: unknown) => { ok: boolean };
    };
    expect(call.lane).toBe('creator_draft');
    expect(call.prompt).toContain('Ein Beispiel.');
    expect(call.validate(style).ok).toBe(true);
    expect(call.validate({ tonality: 'x' }).ok).toBe(false);
  });

  it('macht aus LaTeX-Pfeilen, auch verstümmelten, einen echten Pfeil', async () => {
    mockAiObject.mockResolvedValueOnce({ ok: true, data: style });

    const { styleBlock } = await analyzeTextForm('Pressemitteilung', [{ content: 'x' }]);

    expect(styleBlock).toContain('**Aufbau:** Headline → Forderung → Zitat');
    expect(styleBlock).not.toContain('ightarrow');
  });

  it('wirft, wenn die Lane keine gültige Analyse liefert', async () => {
    mockAiObject.mockResolvedValueOnce({ ok: false, error: 'Ungültige Stil-Analyse' });

    await expect(analyzeTextForm('Pressemitteilung', [{ content: 'x' }])).rejects.toThrow(
      'Ungültige Stil-Analyse'
    );
  });
});
