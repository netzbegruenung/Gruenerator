/**
 * Die Antwortmodus-Registry gegen das Wire-Enum, das sie darstellt — dieselbe
 * Naht wie bei der Suchtiefe: ein Modus nur auf einer Seite ist entweder eine
 * Option, die immer 400 liefert, oder einer, den niemand wählen kann.
 */
import { notebookAnswerModeSchema, notebookResolvedAnswerModeSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  answerModeLabel,
  DEFAULT_NOTEBOOK_ANSWER_MODE,
  NOTEBOOK_ANSWER_MODES,
  notebookAnswerModeDef,
} from './notebookAnswerMode';

describe('NOTEBOOK_ANSWER_MODES', () => {
  it('covers the wire enum exactly', () => {
    expect(NOTEBOOK_ANSWER_MODES.map((m) => m.mode)).toEqual(notebookAnswerModeSchema.options);
  });

  it('labels every mode and says what it does', () => {
    expect(NOTEBOOK_ANSWER_MODES.map((m) => m.label)).toEqual(['Automatisch', 'Chat', 'Präzision']);
    for (const m of NOTEBOOK_ANSWER_MODES) expect(m.description).not.toBe('');
  });

  it('defaults to auto', () => {
    expect(DEFAULT_NOTEBOOK_ANSWER_MODE).toBe('auto');
  });
});

describe('notebookAnswerModeDef', () => {
  it.each(notebookAnswerModeSchema.options)('resolves %s to its own entry', (mode) => {
    expect(notebookAnswerModeDef(mode).mode).toBe(mode);
  });

  it('falls back to the default for an id this build does not know', () => {
    expect(notebookAnswerModeDef('turbo' as never).mode).toBe(DEFAULT_NOTEBOOK_ANSWER_MODE);
    expect(notebookAnswerModeDef(undefined).mode).toBe(DEFAULT_NOTEBOOK_ANSWER_MODE);
  });
});

describe('answerModeLabel', () => {
  it('names the mode a turn ran in', () => {
    expect(answerModeLabel('chat')).toBe('Chatmodus');
    expect(answerModeLabel('praezision')).toBe('Präzisionsmodus');
  });

  it('has a label for every resolved mode', () => {
    for (const mode of notebookResolvedAnswerModeSchema.options) {
      expect(answerModeLabel(mode)).not.toBe('');
    }
  });
});
