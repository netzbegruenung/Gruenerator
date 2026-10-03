/**
 * `{{partyName}}` im Systemprompt: kein Aufrufer übergibt den Namen, also
 * entscheidet der Rückfall. Der war fest „Bündnis 90/Die Grünen" — auch für
 * die österreichischen Sujets.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiText = vi.fn();
vi.mock('../../../services/ai/generate.js', () => ({ aiText }));

const { generateUnifiedTexts } = await import('./unifiedHandler.js');

function systemPromptOfFirstCall(): string {
  const call = aiText.mock.calls[0]?.[0] as { system: string } | undefined;
  return call?.system ?? '';
}

beforeEach(() => {
  aiText.mockReset();
  aiText.mockResolvedValue('');
});

describe('partyName-Rückfall', () => {
  it('nimmt für einen AT-Typ den österreichischen Namen', async () => {
    await generateUnifiedTexts('dreizeilen_at', { thema: 'Wind' });
    expect(systemPromptOfFirstCall()).toContain('Die Grünen – Die Grüne Alternative');
    expect(systemPromptOfFirstCall()).not.toContain('Bündnis 90');
  });

  it('nimmt ihn auch ohne eigenen AT-Prompt, wenn die Locale de-AT ist', async () => {
    await generateUnifiedTexts('zitat', { thema: 'Wind', userLocale: 'de-AT' });
    expect(systemPromptOfFirstCall()).toContain('Die Grünen – Die Grüne Alternative');
  });

  // Eine AT-Slider-Vorlage gibt es nicht; der Text soll trotzdem stimmen.
  it('nimmt ihn auch im Slider-Text', async () => {
    await generateUnifiedTexts('slider', { thema: 'Wind', count: 3, userLocale: 'de-AT' });
    expect(systemPromptOfFirstCall()).toContain('Die Grünen – Die Grüne Alternative');
  });

  it('bleibt ohne Locale beim deutschen Namen', async () => {
    await generateUnifiedTexts('zitat', { thema: 'Wind' });
    expect(systemPromptOfFirstCall()).toContain('Bündnis 90/Die Grünen');
  });

  it('lässt einen übergebenen Namen stehen', async () => {
    await generateUnifiedTexts('dreizeilen_at', { thema: 'Wind', partyName: 'Grüne Wien' });
    expect(systemPromptOfFirstCall()).toContain('Grüne Wien');
  });
});
