import { MAX_DRAFT_BRIEF_CHARS, MAX_TEXT_FORM_EXAMPLE_CHARS } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  answerToRawExamples,
  readFromAnswer,
  recipeDraftBrief,
  recipeFormFromAnswer,
} from './recipeFromAnswer';
import { splitExamples } from './splitExamples';

const SPEC = {
  title: 'Vereinseinladung',
  mention: 'vereinseinladung',
  description: 'Einladung zur Mitgliederversammlung',
  iconKey: 'PiEnvelope',
  styleBlock: 'Förmlicher Ton.',
};

describe('readFromAnswer', () => {
  it('reads the answer from the navigation state', () => {
    expect(readFromAnswer({ fromAnswer: { text: 'Hallo' } })).toEqual({ text: 'Hallo' });
  });

  it.each([null, undefined, {}, { fromAnswer: null }, { fromAnswer: { text: '  ' } }, 'x'])(
    'ignores %j',
    (state) => {
      expect(readFromAnswer(state)).toBeNull();
    }
  );
});

describe('answerToRawExamples', () => {
  it('keeps one answer as one example', () => {
    expect(
      splitExamples(answerToRawExamples('Erster Absatz.\n\nZweiter Absatz.')).examples
    ).toEqual(['Erster Absatz.\n\nZweiter Absatz.']);
  });

  it('cuts the answer at the example limit', () => {
    const long = 'a'.repeat(MAX_TEXT_FORM_EXAMPLE_CHARS + 50);
    expect(answerToRawExamples(long)).toHaveLength(MAX_TEXT_FORM_EXAMPLE_CHARS);
  });
});

describe('recipeFormFromAnswer', () => {
  it('puts the draft and the answer into one form', () => {
    const form = recipeFormFromAnswer('Antworttext', SPEC);
    expect(form).toMatchObject({ title: 'Vereinseinladung', styleBlock: 'Förmlicher Ton.' });
    expect(form.rawExamples).toBe('Antworttext');
  });

  it('still carries the answer when no draft could be made', () => {
    expect(recipeFormFromAnswer('Antworttext', null)).toEqual({ rawExamples: 'Antworttext' });
  });
});

describe('recipeDraftBrief', () => {
  it('lets the draft model see the answer', () => {
    const brief = recipeDraftBrief('Liebe Mitglieder, am Freitag laden wir zur Versammlung ein.');
    expect(brief).toContain('Ein Rezept, das Texte wie dieses Beispiel erzeugt.');
    expect(brief).toContain('Liebe Mitglieder, am Freitag laden wir zur Versammlung ein.');
  });

  it('clips a long answer so the whole brief stays within the cap', () => {
    const brief = recipeDraftBrief('x'.repeat(MAX_DRAFT_BRIEF_CHARS * 3));
    expect(brief).toHaveLength(MAX_DRAFT_BRIEF_CHARS);
  });
});
