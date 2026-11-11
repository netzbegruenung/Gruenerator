import { describe, expect, it } from 'vitest';

import { findStutterWords } from '../stutter.js';

function words(text: string) {
  return text.split(' ').map((word, i) => ({ word, start: i * 0.3, end: i * 0.3 + 0.25 }));
}

function kept(text: string): string {
  const list = words(text);
  const drop = findStutterWords(list);
  return list
    .filter((_, i) => !drop.has(i))
    .map((x) => x.word)
    .join(' ');
}

describe('findStutterWords', () => {
  it('drops the first of a repeated phrase', () => {
    expect(kept('Seit drei Jahren seit drei Jahren warten die Menschen')).toBe(
      'seit drei Jahren warten die Menschen'
    );
    expect(kept('und die Straße ist die Straße ist einfach zu eng.')).toBe(
      'und die Straße ist einfach zu eng.'
    );
  });

  it('drops a repeated long single word', () => {
    expect(kept('Wärmepumpe braucht braucht keine perfekte Dämmung.')).toBe(
      'Wärmepumpe braucht keine perfekte Dämmung.'
    );
  });

  it('keeps short repeated words, which German needs', () => {
    expect(kept('die Frau, die die Zeitung liest')).toBe('die Frau, die die Zeitung liest');
    expect(kept('Heute geht es ums ums Klimaticket.')).toBe('Heute geht es ums ums Klimaticket.');
  });

  it('keeps a repeat set off by a comma', () => {
    expect(kept('Das ist sehr, sehr wichtig.')).toBe('Das ist sehr, sehr wichtig.');
    expect(kept('Wir müssen handeln, wir müssen handeln.')).toBe(
      'Wir müssen handeln, wir müssen handeln.'
    );
  });
});
