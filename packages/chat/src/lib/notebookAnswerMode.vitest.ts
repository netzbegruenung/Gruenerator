/**
 * Die Antwortmodus-Registry gegen das Wire-Enum, das sie darstellt — dieselbe
 * Naht wie bei der Suchtiefe: ein Modus nur auf einer Seite ist entweder eine
 * Option, die immer 400 liefert, oder einer, den niemand wählen kann.
 */
import { notebookAnswerModeSchema, notebookResolvedAnswerModeSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  answerModeAutoHint,
  answerModeLabel,
  composerModeRunsLiveSearch,
  DEFAULT_NOTEBOOK_ANSWER_MODE,
  detectMagicIntent,
  NOTEBOOK_ANSWER_MODES,
  NOTEBOOK_COMPOSER_MODES,
  notebookAnswerModeDef,
  notebookComposerModeDef,
  toNotebookAnswerMode,
} from './notebookAnswerMode';

describe('NOTEBOOK_ANSWER_MODES', () => {
  it('covers the wire enum exactly', () => {
    expect(NOTEBOOK_ANSWER_MODES.map((m) => m.mode)).toEqual(notebookAnswerModeSchema.options);
  });

  it('labels every mode and says what it does', () => {
    expect(NOTEBOOK_ANSWER_MODES.map((m) => m.label)).toEqual([
      'Magic Search',
      'Chat',
      'Präzision',
    ]);
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
    expect(notebookAnswerModeDef(null).mode).toBe(DEFAULT_NOTEBOOK_ANSWER_MODE);
    expect(notebookAnswerModeDef().mode).toBe(DEFAULT_NOTEBOOK_ANSWER_MODE);
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

describe('answerModeAutoHint', () => {
  it('marks only the guard-made choices as automatic', () => {
    expect(answerModeAutoHint('pregate')).toBe('automatisch gewählt');
    expect(answerModeAutoHint('guard')).toBe('automatisch gewählt');
    expect(answerModeAutoHint('guard_fallback')).toBe('automatisch gewählt');
    for (const r of ['explicit', 'ineligible', 'default', null] as const) {
      expect(answerModeAutoHint(r)).toBeNull();
    }
  });
});

describe('NOTEBOOK_COMPOSER_MODES', () => {
  it('is the wire modes plus the client-only Manuell', () => {
    expect(NOTEBOOK_COMPOSER_MODES.map((m) => m.mode)).toEqual([
      ...notebookAnswerModeSchema.options,
      'manuell',
    ]);
  });

  it('never puts Manuell on the wire', () => {
    expect(notebookAnswerModeSchema.safeParse(toNotebookAnswerMode('manuell')).success).toBe(true);
    for (const mode of notebookAnswerModeSchema.options) {
      expect(toNotebookAnswerMode(mode)).toBe(mode);
    }
  });

  it('searches live only in Automatisch and Manuell', () => {
    expect(
      NOTEBOOK_COMPOSER_MODES.filter((m) => composerModeRunsLiveSearch(m.mode)).map((m) => m.mode)
    ).toEqual(['auto', 'manuell']);
  });

  it('reads a stored value tolerantly', () => {
    expect(notebookComposerModeDef('manuell').label).toBe('Manuell');
    expect(notebookComposerModeDef('turbo').mode).toBe(DEFAULT_NOTEBOOK_ANSWER_MODE);
  });
});

describe('detectMagicIntent', () => {
  it.each([
    'Hitzeschutz',
    'Hitzeschutz Kitas',
    'Hitzeschutz, Dokumente seit 30 Tagen',
    'seit 30 Tagen Hitzeschutz',
    'bis 2030 Kohleausstieg',
    'in Bayern Windkraft',
    'Wohnungsbau Wasserstoff',
    'Istanbul Konvention',
    'Kanzleramt Wortprotokoll',
    '',
  ])('searches for „%s“', (text) => {
    expect(detectMagicIntent(text)).toBe('suche');
  });

  it.each([
    'was tun die Grünen Berlin für Hitzeschutz?',
    'Wie steht die Partei zur Wärmepumpe',
    'fasse den Antrag zum Hitzeschutz zusammen',
    'Hitzeschutz?',
    'Welche Kommunen haben einen Hitzeaktionsplan',
    'Gibt es Beschlüsse zum Tempolimit',
    'Können Kitas Förderung beantragen',
    '„Warum Hitzeschutz',
    'Hitzeschutz Kitas erklären',
    'Anträge zu Radwegen bitte',
    'Vergleiche die Programme',
  ])('chats for „%s“', (text) => {
    expect(detectMagicIntent(text)).toBe('chat');
  });
});

describe('toNotebookAnswerMode with a Magic Search intent', () => {
  it('asks for chat when Magic Search recognised a chat', () => {
    expect(toNotebookAnswerMode('auto', 'chat')).toBe('chat');
  });

  it('leaves everything else as without an intent', () => {
    expect(toNotebookAnswerMode('auto', 'suche')).toBe('auto');
    expect(toNotebookAnswerMode('auto', null)).toBe('auto');
    expect(toNotebookAnswerMode('praezision', 'chat')).toBe('praezision');
    expect(toNotebookAnswerMode('manuell', 'chat')).toBe(DEFAULT_NOTEBOOK_ANSWER_MODE);
  });
});
