import { describe, expect, it } from 'vitest';

import { splitCompositeQuestion } from './questionDecomposition.js';

describe('splitCompositeQuestion', () => {
  it('splits a labelled batch, one part per label', () => {
    const parts = splitCompositeQuestion(
      [
        'A1  Wie viele Unterschriften hatte die Petition zur Energiewende nach der ersten Woche?',
        'A2  Wie hoch war die Spendensumme aus dem Spendenlauf, und wofür sollte sie verwendet werden?',
        'A3  Welcher AfD-Umfragewert wird genannt, von welchem Institut und für welches Bundesland?',
      ].join('\n')
    );

    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(
      'Wie viele Unterschriften hatte die Petition zur Energiewende nach der ersten Woche?'
    );
    expect(parts[2]).toContain('AfD-Umfragewert');
  });

  it('keeps a wrapped question with the part it belongs to', () => {
    const parts = splitCompositeQuestion(
      [
        'C1  Wer hat gesagt, der letzte Tankrabatt habe Deutschland drei Milliarden',
        'Euro gekostet? Nenne Urheber und Datum.',
        'C2  Wer ist Herbert Rabl, und in welchem Zusammenhang wird er genannt?',
      ].join('\n')
    );

    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('drei Milliarden Euro gekostet');
    expect(parts[0]).toContain('Nenne Urheber und Datum.');
    expect(parts[1]).toContain('Herbert Rabl');
  });

  it('splits numbered and bulleted batches', () => {
    expect(
      splitCompositeQuestion('1. Was steht zum Rentenniveau?\n2. Wer hat das gefordert?')
    ).toHaveLength(2);
    expect(
      splitCompositeQuestion('- Was steht zum Rentenniveau?\n- Wer hat das gefordert?')
    ).toHaveLength(2);
  });

  it('splits a run-on paragraph carrying inline labels', () => {
    const parts = splitCompositeQuestion(
      'C1 Wer hat das zum Tankrabatt gesagt? C2 Wer ist Herbert Rabl? C3 Ist die Entschuldigung ernst gemeint?'
    );

    expect(parts).toHaveLength(3);
    expect(parts[1]).toBe('Wer ist Herbert Rabl?');
  });

  it('splits several questions typed as one paragraph', () => {
    const parts = splitCompositeQuestion(
      'Welche Forderung wird zum Rentenniveau erhoben? Wer hat sie gestellt und wann?'
    );

    expect(parts).toHaveLength(2);
    expect(parts[1]).toBe('Wer hat sie gestellt und wann?');
  });

  it('splits an imperative batch without question marks', () => {
    const parts = splitCompositeQuestion(
      '1. Fasse die Position zum Rentenniveau zusammen\n2. Nenne die zitierten Wirtschaftsvertreter'
    );

    expect(parts).toHaveLength(2);
  });

  it('caps the fan-out at eight parts', () => {
    const many = Array.from(
      { length: 14 },
      (_, i) => `A${i + 1}  Was steht in Abschnitt ${i + 1}?`
    );

    expect(splitCompositeQuestion(many.join('\n'))).toHaveLength(8);
  });

  it('leaves a single question alone', () => {
    expect(splitCompositeQuestion('Wer ist Herbert Rabl?')).toEqual([]);
    expect(
      splitCompositeQuestion(
        'Wie hoch war die Spendensumme aus dem Spendenlauf, und wofür sollte sie verwendet werden?'
      )
    ).toEqual([]);
  });

  it('does not split prose that merely contains a list', () => {
    expect(
      splitCompositeQuestion(
        'Ich habe folgende Unterlagen hochgeladen:\n- Protokoll vom 27.04.\n- Anlage 3\nWas steht darin zum Rentenniveau?'
      )
    ).toEqual([]);
  });

  it('drops stray labels below the minimum length', () => {
    const parts = splitCompositeQuestion(
      'A1  ok\nA2  Wie viele Unterschriften hatte die Petition?\nA3  Wer hat sie eingereicht und wann genau?'
    );

    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.length >= 12)).toBe(true);
  });

  it('deduplicates repeated parts', () => {
    const parts = splitCompositeQuestion(
      '1. Wer ist Herbert Rabl?\n2. Wer ist Herbert Rabl?\n3. Wann wurde er zitiert und wo?'
    );

    expect(parts).toHaveLength(2);
  });

  it('handles empty and whitespace input', () => {
    expect(splitCompositeQuestion('')).toEqual([]);
    expect(splitCompositeQuestion('   \n  ')).toEqual([]);
  });
});
