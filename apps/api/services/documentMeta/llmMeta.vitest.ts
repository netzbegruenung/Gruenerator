import { describe, expect, it, vi } from 'vitest';

import { extractHeaderMeta } from './headerMeta.js';
import { extractDocumentMeta, needsLlm, verifyLlmMeta, type LlmMetaRaw } from './llmMeta.js';

const NOW = new Date('2026-09-23T12:00:00Z');
const TEXT =
  'Klimaschutz jetzt\nDer Bundesvorstand hat in seiner Sitzung\nam 8. Januar 2024 diese Position gefasst.\n\nWir fordern …';

const raw = (over: Partial<LlmMetaRaw> = {}): LlmMetaRaw => ({
  dates: [],
  gremium: null,
  docVersion: null,
  ...over,
});

describe('verifyLlmMeta — nur, was wörtlich dasteht', () => {
  it('behält ein Datum, dessen Beleg wörtlich im Text steht und das Datum trägt', () => {
    const out = verifyLlmMeta(
      raw({
        dates: [
          {
            date: '2024-01-08',
            kind: 'beschluss',
            evidence: 'am 8. Januar 2024 diese Position gefasst',
          },
        ],
      }),
      TEXT,
      { locale: 'de-DE', now: NOW }
    );
    expect(out.dates).toEqual([
      expect.objectContaining({ date: '2024-01-08', kind: 'beschluss', precision: 'day' }),
    ]);
  });

  it('prüft den Beleg über Zeilenumbrüche hinweg (Leerraum normalisiert)', () => {
    const out = verifyLlmMeta(
      raw({
        dates: [
          {
            date: '2024-01-08',
            kind: 'beschluss',
            evidence: 'in seiner Sitzung am 8. Januar 2024',
          },
        ],
      }),
      TEXT,
      { locale: 'de-DE', now: NOW }
    );
    expect(out.dates).toHaveLength(1);
  });

  it('verwirft ein Datum, dessen Beleg nicht im Text steht', () => {
    const out = verifyLlmMeta(
      raw({
        dates: [{ date: '2024-01-08', kind: 'beschluss', evidence: 'Beschluss vom 08.01.2024' }],
      }),
      TEXT,
      { locale: 'de-DE', now: NOW }
    );
    expect(out.dates).toEqual([]);
  });

  it('verwirft ein Datum, das im (echten) Beleg gar nicht steht', () => {
    const out = verifyLlmMeta(
      raw({
        dates: [
          { date: '2024-01-09', kind: 'beschluss', evidence: 'am 8. Januar 2024 diese Position' },
        ],
      }),
      TEXT,
      { locale: 'de-DE', now: NOW }
    );
    expect(out.dates).toEqual([]);
  });

  it('verwirft eine unbekannte Art und ein Beschlussdatum in der Zukunft', () => {
    const text = 'Beschlossen am 01.01.2030. Gültig ab 01.01.2025.';
    const out = verifyLlmMeta(
      raw({
        dates: [
          { date: '2030-01-01', kind: 'beschluss', evidence: 'Beschlossen am 01.01.2030' },
          { date: '2025-01-01', kind: 'gueltig' as 'stand', evidence: 'Gültig ab 01.01.2025' },
        ],
      }),
      text,
      { locale: 'de-DE', now: NOW }
    );
    expect(out.dates).toEqual([]);
  });

  it('behält ein Gremium nur, wenn Name und Beleg wörtlich stehen', () => {
    const ok = verifyLlmMeta(
      raw({
        gremium: { name: 'Bundesvorstand', evidence: 'Der Bundesvorstand hat in seiner Sitzung' },
      }),
      TEXT,
      { locale: 'de-DE', now: NOW }
    );
    expect(ok.gremium).toBe('Bundesvorstand');

    const invented = verifyLlmMeta(
      raw({ gremium: { name: 'Parteirat', evidence: 'Der Bundesvorstand hat in seiner Sitzung' } }),
      TEXT,
      { locale: 'de-DE', now: NOW }
    );
    expect(invented.gremium).toBeNull();

    const noEvidence = verifyLlmMeta(
      raw({ gremium: { name: 'Parteirat', evidence: 'Beschluss des Parteirats' } }),
      TEXT,
      { locale: 'de-DE', now: NOW }
    );
    expect(noEvidence.gremium).toBeNull();
  });
});

describe('needsLlm', () => {
  it('fragt nicht, wenn Datum und Gremium sicher sind', () => {
    expect(
      needsLlm(extractHeaderMeta('Beschluss des Parteirats vom 12.03.2024', { now: NOW }))
    ).toBe(false);
  });

  it('fragt ohne Gremium, ohne datiertes Signal oder bei Widerspruch', () => {
    expect(needsLlm(extractHeaderMeta('Stand: 12.03.2024', { now: NOW }))).toBe(true);
    expect(needsLlm(extractHeaderMeta('Beschluss des Parteirats', { now: NOW }))).toBe(true);
    expect(
      needsLlm(
        extractHeaderMeta(
          'Beschluss des Parteirats vom 12.03.2024 … Beschluss des Parteirats vom 05.10.2024',
          { now: NOW }
        )
      )
    ).toBe(true);
    expect(needsLlm(extractHeaderMeta('Text', { filename: '2024-03-12.pdf', now: NOW }))).toBe(
      true
    );
  });
});

describe('extractDocumentMeta', () => {
  const llmAnswer = raw({
    dates: [
      { date: '2024-01-08', kind: 'beschluss', evidence: 'am 8. Januar 2024 diese Position' },
      { date: '2023-01-01', kind: 'stand', evidence: 'Stand 1. Januar 2023' },
    ],
    gremium: { name: 'Bundesvorstand', evidence: 'Der Bundesvorstand hat' },
  });

  it('ergänzt die Heuristik um geprüfte Felder und verwirft erfundene', async () => {
    const aiObject = vi.fn().mockResolvedValue({ ok: true, data: llmAnswer });
    const meta = await extractDocumentMeta(
      { text: TEXT, filename: 'klima.pdf', locale: 'de-DE', aiAllowed: true, now: NOW },
      { aiObject }
    );
    expect(aiObject).toHaveBeenCalledTimes(1);
    const call = aiObject.mock.calls[0][0] as { lane: string; pinned: string; prompt: string };
    expect(call.lane).toBe('document_meta_extraction');
    expect(call.pinned).toBe('trivial');
    expect(call.prompt).toContain('klima.pdf');
    expect(meta.date).toBe('2024-01-08');
    expect(meta.dateKind).toBe('beschluss');
    expect(meta.gremium).toBe('Bundesvorstand');
    expect(meta.dates.map((d) => d.kind)).not.toContain('stand');
    expect(meta.source).toBe('llm');
  });

  it('fragt ohne Einwilligung kein Modell und liefert die Heuristik', async () => {
    const aiObject = vi.fn();
    const meta = await extractDocumentMeta(
      { text: TEXT, filename: null, locale: 'de-DE', aiAllowed: false, now: NOW },
      { aiObject }
    );
    expect(aiObject).not.toHaveBeenCalled();
    expect(meta.source).toBe('heuristic');
  });

  it('fragt kein Modell, wenn die Heuristik reicht', async () => {
    const aiObject = vi.fn();
    const meta = await extractDocumentMeta(
      {
        text: 'Beschluss des Parteirats vom 12.03.2024',
        filename: null,
        locale: 'de-DE',
        aiAllowed: true,
        now: NOW,
      },
      { aiObject }
    );
    expect(aiObject).not.toHaveBeenCalled();
    expect(meta.gremium).toBe('Parteirat');
  });

  it('bleibt bei der Heuristik, wenn das Modell scheitert', async () => {
    const aiObject = vi.fn().mockResolvedValue({ ok: false, error: 'kaputt' });
    const meta = await extractDocumentMeta(
      { text: 'Stand: 12.03.2024', filename: null, locale: 'de-DE', aiAllowed: true, now: NOW },
      { aiObject }
    );
    expect(meta.date).toBe('2024-03-12');
    expect(meta.source).toBe('heuristic');
  });

  it('lässt das Modell einen Widerspruch zwischen Beschlussdaten entscheiden', async () => {
    const text =
      'Beschluss des Parteirats vom 05.10.2024\nÄnderung: Beschluss des Parteirats vom 12.03.2024';
    const aiObject = vi.fn().mockResolvedValue({
      ok: true,
      data: raw({
        dates: [
          {
            date: '2024-03-12',
            kind: 'beschluss',
            evidence: 'Beschluss des Parteirats vom 12.03.2024',
          },
        ],
      }),
    });
    const meta = await extractDocumentMeta(
      { text, filename: null, locale: 'de-DE', aiAllowed: true, now: NOW },
      { aiObject }
    );
    expect(meta.date).toBe('2024-03-12');
    expect(meta.dates.filter((d) => d.kind === 'beschluss')).toHaveLength(2);
    expect(meta.source).toBe('heuristic+llm');
  });

  it('stellt ein drittes, belegtes Beschlussdatum des Modells nach vorn', async () => {
    const text =
      'Beschluss des Parteirats vom 05.10.2024\nÄnderung: Beschluss des Parteirats vom 12.03.2024\n' +
      'Die Versammlung am 20.11.2024 hat die Fassung angenommen.';
    const aiObject = vi.fn().mockResolvedValue({
      ok: true,
      data: raw({
        dates: [
          {
            date: '2024-11-20',
            kind: 'beschluss',
            evidence: 'Die Versammlung am 20.11.2024 hat die Fassung angenommen.',
          },
        ],
      }),
    });
    const meta = await extractDocumentMeta(
      { text, filename: null, locale: 'de-DE', aiAllowed: true, now: NOW },
      { aiObject }
    );
    expect(meta.date).toBe('2024-11-20');
    expect(meta.conflict).toBe(false);
    expect(meta.dates.filter((d) => d.date === '2024-11-20')).toHaveLength(1);
    expect(meta.dates.filter((d) => d.kind === 'beschluss')).toHaveLength(3);
  });
});
