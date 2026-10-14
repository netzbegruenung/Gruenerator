import { PODCAST_MAX_TURN_CHARS, PODCAST_MAX_TURNS } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, fitScript, validateDraft } from './podcastScript.js';

const turn = (speaker: 'a' | 'b', text: string) => ({ speaker, text });
const alternating = (n: number) =>
  Array.from({ length: n }, (_, i) => turn(i % 2 ? 'b' : 'a', `Satz Nummer ${i}.`));

describe('fitScript', () => {
  it('strips what a voice would read literally', () => {
    const fitted = fitScript({
      title: '**Schwammstadt** erklärt',
      turns: [
        turn('b', 'Regen versickert [1][2] vor Ort, siehe https://example.org/x. **Wichtig**!'),
      ],
    });
    expect(fitted.title).toBe('Schwammstadt erklärt');
    expect(fitted.turns[0]?.text).toBe('Regen versickert vor Ort, siehe Wichtig!');
  });

  it('clips long turns at a sentence end and caps the number of turns', () => {
    const long = `${'Ein kurzer Satz. '.repeat(60)}`;
    const fitted = fitScript({ title: 'T', turns: [turn('a', long), ...alternating(60)] });
    expect(fitted.turns).toHaveLength(PODCAST_MAX_TURNS);
    const first = fitted.turns[0]?.text ?? '';
    expect(first.length).toBeLessThanOrEqual(PODCAST_MAX_TURN_CHARS);
    expect(first.endsWith('.')).toBe(true);
  });

  it('drops turns that are empty after cleaning', () => {
    const fitted = fitScript({ title: 'T', turns: [turn('a', '[1]'), turn('b', 'Hallo.')] });
    expect(fitted.turns).toEqual([turn('b', 'Hallo.')]);
  });
});

describe('validateDraft', () => {
  it('accepts and fits a usable draft', () => {
    const result = validateDraft({ title: 'Folge', turns: alternating(8) });
    expect(result.ok).toBe(true);
  });

  it('rejects a draft that is too short after cleaning', () => {
    const result = validateDraft({
      title: 'Folge',
      turns: [...alternating(5), turn('a', '**')],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown speaker', () => {
    const result = validateDraft({
      title: 'Folge',
      turns: [...alternating(7), turn('c' as 'a', 'x')],
    });
    expect(result.ok).toBe(false);
  });
});

describe('buildSystemPrompt', () => {
  it('adds the Austria block only for de-AT', () => {
    expect(buildSystemPrompt('de-AT')).toContain('LÄNDERKONTEXT: ÖSTERREICH');
    expect(buildSystemPrompt('de-DE')).not.toContain('ÖSTERREICH');
  });
});
