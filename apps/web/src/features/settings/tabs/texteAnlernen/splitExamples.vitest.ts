import { describe, expect, it } from 'vitest';

import { EXAMPLE_SEPARATOR, joinExamples, splitExamples } from './splitExamples';

describe('splitExamples', () => {
  it('splits on horizontal rules', () => {
    const res = splitExamples('Erster Text\n\n---\n\nZweiter Text\n***\nDritter Text');
    expect(res.strategy).toBe('rule');
    expect(res.examples).toEqual(['Erster Text', 'Zweiter Text', 'Dritter Text']);
  });

  it('splits on "Beispiel N" headings', () => {
    const res = splitExamples('Beispiel 1\nHallo Welt\n\nBeispiel 2:\nZweiter Post');
    expect(res.strategy).toBe('heading');
    expect(res.examples).toEqual(['Hallo Welt', 'Zweiter Post']);
  });

  it('splits on bare numbering', () => {
    const res = splitExamples('1.\nErster\n2)\nZweiter');
    expect(res.strategy).toBe('numbered');
    expect(res.examples).toEqual(['Erster', 'Zweiter']);
  });

  it('leaves a bare keyword line inside an example alone', () => {
    // „Text:"/„Post:" stehen als Etikett mitten in EINEM Beispiel, wenn aus einer
    // Vorlage kopiert wurde — sie dürfen nicht als Überschrift gelesen werden.
    const res = splitExamples('Post:\nUnser Antrag ist durch!\n\nText:\nMehr dazu morgen.');
    expect(res.strategy).toBe('single');
    expect(res.examples).toHaveLength(1);
  });

  it('keeps a numbered Antrag with a preamble as one example', () => {
    const antrag = [
      'Antrag: Radwege ausbauen',
      'Der Stadtrat möge beschließen:',
      '',
      '1.',
      'Die Verwaltung erstellt ein Radwegekonzept.',
      '',
      '2.',
      'Die Mittel werden im Haushalt 2027 bereitgestellt.',
    ].join('\n');
    const res = splitExamples(antrag);
    expect(res.strategy).toBe('single');
    expect(res.examples).toEqual([antrag]);
  });

  it('ignores numbering that does not count up from one', () => {
    const res = splitExamples('3.\nDrittens\n7.\nSiebtens');
    expect(res.strategy).toBe('single');
    expect(res.examples).toHaveLength(1);
  });

  it('splits on runs of two or more blank lines', () => {
    const res = splitExamples('Erster Absatz\n\nnoch derselbe Text\n\n\nZweiter Text');
    expect(res.strategy).toBe('blank');
    expect(res.examples).toEqual(['Erster Absatz\n\nnoch derselbe Text', 'Zweiter Text']);
  });

  it('keeps a single blank line as a paragraph break, not a separator', () => {
    const res = splitExamples('Absatz eins\n\nAbsatz zwei');
    expect(res.strategy).toBe('single');
    expect(res.examples).toEqual(['Absatz eins\n\nAbsatz zwei']);
  });

  it('prefers rules over blank runs when both appear', () => {
    const res = splitExamples('A\n\n\nnoch A\n\n---\n\nB');
    expect(res.strategy).toBe('rule');
    expect(res.examples).toEqual(['A\n\n\nnoch A', 'B']);
  });

  it('returns nothing for an empty input', () => {
    expect(splitExamples('   \n\n ').examples).toEqual([]);
  });

  it('round-trips saved examples through the single field', () => {
    const saved = [{ content: 'Eins' }, { content: 'Zwei\n\nmit Absatz' }, { content: 'Drei' }];
    const res = splitExamples(joinExamples(saved));
    expect(res.examples).toEqual(saved.map((e) => e.content));
  });

  it('joins with the separator the splitter recognises', () => {
    expect(joinExamples([{ content: 'a' }, { content: 'b' }])).toBe(`a${EXAMPLE_SEPARATOR}b`);
  });
});
