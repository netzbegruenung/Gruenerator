import { beforeEach, describe, expect, it, vi } from 'vitest';

const report = vi.fn();
vi.mock('../../../../utils/reportBackgroundError.js', () => ({
  reportBackgroundError: (...args: unknown[]) => report(...args),
}));

const { endsMidWord, reportMidWordEnd } = await import('./midWordEnd.js');

// The live case of 19.11.2026, last paragraph verbatim.
const LIVE_CUT =
  'Hitzeschutz ist kommunale Daseinsvorsorge.\n\nDenn eines ist klar: Die Klimakrise wird härter, die Schäden werden teurer — zwischen 2000 und 2021 sind bereits Schäden von fast 145 Milliarden Euro entstanden. Jeder Euro, den wir heute in Hitzeschutz investieren, spart morgen Leid und Kosten. Unsere Kommunen sind handlungsbereit. Jetzt muss der Bund liefe';

const PARAGRAPH =
  'Die Klimakrise wird härter, die Schäden werden teurer. Jeder Euro, den wir heute in Hitzeschutz investieren, spart morgen Leid und Kosten für alle Menschen vor Ort';

describe('endsMidWord', () => {
  it('flags the live cut', () => {
    expect(endsMidWord(LIVE_CUT)).toBe(true);
  });

  it('accepts a paragraph that ends with punctuation', () => {
    expect(endsMidWord(`${PARAGRAPH}.`)).toBe(false);
    expect(endsMidWord(`${PARAGRAPH}?\n`)).toBe(false);
  });

  it('accepts a closing signature, heading or question line', () => {
    expect(endsMidWord(`${PARAGRAPH}.\n\nFranziska Brantner`)).toBe(false);
    expect(endsMidWord(`${PARAGRAPH}.\n\n## Unsere Forderungen`)).toBe(false);
  });

  it('accepts list items and table rows without a full stop', () => {
    expect(endsMidWord(`Intro.\n\n- ${PARAGRAPH}`)).toBe(false);
    expect(endsMidWord(`Intro.\n\n2. ${PARAGRAPH}`)).toBe(false);
    expect(endsMidWord(`Intro.\n\n| ${PARAGRAPH}`)).toBe(false);
  });

  it('accepts a long line without any sentence end (slogan, hashtags)', () => {
    expect(endsMidWord('#Hitzeschutz #Kommunen '.repeat(8).trim())).toBe(false);
  });
});

describe('reportMidWordEnd', () => {
  beforeEach(() => report.mockReset());

  it('reports a mid-word end on finishReason stop to GlitchTip', () => {
    reportMidWordEnd(LIVE_CUT, 'stop', 'mistral.chat/mistral-large-4', 'unified');

    expect(report).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
      job: 'agentic-answer-midword',
      model: 'mistral.chat/mistral-large-4',
      phase: 'unified',
      chars: LIVE_CUT.length,
    });
  });

  it('stays quiet for other finish reasons — those are repaired already', () => {
    reportMidWordEnd(LIVE_CUT, 'length', 'm', 'unified');
    reportMidWordEnd(LIVE_CUT, null, 'm', 'synth');

    expect(report).not.toHaveBeenCalled();
  });

  it('stays quiet for a complete answer', () => {
    reportMidWordEnd(`${PARAGRAPH}.`, 'stop', 'm', 'synth');

    expect(report).not.toHaveBeenCalled();
  });
});
