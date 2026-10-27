/**
 * Plausibilitätsprüfung für `tabelle_auswerten` (#5044): ein unplausibles
 * Ergebnis bringt einen Hinweis, ein plausibles keinen, und jeder Fehler der
 * Prüfung selbst heisst „kein Hinweis".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { aiTextMock } = vi.hoisted(() => ({ aiTextMock: vi.fn() }));

vi.mock('../../../services/ai/generate.js', () => ({ aiText: aiTextMock }));
vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { parseVerifierResponse, verifyComputeResult } from './computeResultVerifier.js';

// Der Beta-Fall: gefragt war der Umsatz, summiert wurde die Menge.
const WRONG_COLUMN = {
  question: 'Wie hoch ist der Gesamtumsatz?',
  auftrag: 'Summe der Spalte Umsatz',
  code: 'print("Gesamtumsatz:", df["Menge"].sum())',
  entries: [{ label: 'Gesamtumsatz', value: '1234' }],
};

describe('verifyComputeResult', () => {
  beforeEach(() => {
    aiTextMock.mockReset();
  });

  it('falsche Spalte summiert ⇒ Hinweis', async () => {
    aiTextMock.mockResolvedValue(
      '{"plausible": false, "hint": "Summiert wird Menge statt Umsatz."}'
    );
    expect(await verifyComputeResult(WRONG_COLUMN)).toBe('Summiert wird Menge statt Umsatz.');
    const call = aiTextMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.lane).toBe('chat_compute_verify');
    expect(call.pinned).toBe('compute');
    expect(call.json).toBe(true);
    expect(call.maxOutputTokens).toBe(200);
    expect(typeof call.timeoutMs).toBe('number');
    // Frage der Person UND Auftrag des Modells gehen mit.
    expect(String(call.prompt)).toContain('Wie hoch ist der Gesamtumsatz?');
    expect(String(call.prompt)).toContain('Summe der Spalte Umsatz');
    expect(String(call.prompt)).toContain('df["Menge"]');
  });

  it('unplausibel ohne Hinweistext ⇒ allgemeiner Hinweis', async () => {
    aiTextMock.mockResolvedValue('{"plausible": false}');
    expect(await verifyComputeResult(WRONG_COLUMN)).toMatch(/passt vermutlich nicht/);
  });

  it('richtiges Ergebnis ⇒ kein Hinweis', async () => {
    aiTextMock.mockResolvedValue('{"plausible": true}');
    expect(
      await verifyComputeResult({
        ...WRONG_COLUMN,
        code: 'print("Gesamtumsatz:", df["Umsatz"].sum())',
      })
    ).toBeNull();
  });

  it('Zeitüberschreitung oder Transportfehler ⇒ kein Hinweis', async () => {
    aiTextMock.mockImplementation(async () => {
      throw new Error('Request timed out after 15000ms');
    });
    expect(await verifyComputeResult(WRONG_COLUMN)).toBeNull();
  });

  it('unlesbare Antwort ⇒ kein Hinweis', async () => {
    aiTextMock.mockResolvedValue('Das sieht falsch aus.');
    expect(await verifyComputeResult(WRONG_COLUMN)).toBeNull();
  });

  it('ohne Code oder Auftrag ⇒ kein Modellaufruf', async () => {
    expect(await verifyComputeResult({ ...WRONG_COLUMN, code: '' })).toBeNull();
    expect(await verifyComputeResult({ ...WRONG_COLUMN, auftrag: '' })).toBeNull();
    expect(aiTextMock).not.toHaveBeenCalled();
  });

  it('kürzt ein riesiges Ergebnis auf 1500 Zeichen', async () => {
    aiTextMock.mockResolvedValue('{"plausible": true}');
    await verifyComputeResult({
      ...WRONG_COLUMN,
      entries: [{ label: 'df', value: 'x'.repeat(10_000) }],
    });
    const prompt = String((aiTextMock.mock.calls[0]?.[0] as Record<string, unknown>).prompt);
    expect(prompt.length).toBeLessThan(2500);
  });
});

describe('parseVerifierResponse', () => {
  it('liest umzäuntes JSON', () => {
    expect(parseVerifierResponse('```json\n{"plausible": false, "hint": "x"}\n```')).toEqual({
      plausible: false,
      hint: 'x',
    });
  });

  it('kaputtes JSON ⇒ plausibel', () => {
    expect(parseVerifierResponse('{plausible')).toEqual({ plausible: true });
  });
});
