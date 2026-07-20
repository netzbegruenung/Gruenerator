import { describe, expect, it } from 'vitest';

import {
  buildSystemTargets,
  detectNotebookEntities,
  detectQuestionIntent,
  matchTargetsByName,
} from './omniIntent';

const targets = buildSystemTargets();
const ids = (query: string) => detectNotebookEntities(query, targets).map((m) => m.target.key);

describe('detectNotebookEntities', () => {
  it('finds the Berlin notebook inside a natural question', () => {
    expect(ids('Was tun die Grünen Berlin für Hitzeschutz?')).toEqual(['berlin-notebook']);
  });

  it('is word-bounded — "Berliner" is not "Berlin"', () => {
    expect(ids('Wie gesund ist Berliner Luft?')).toEqual([]);
  });

  it('matches curated aliases (MV, Böll, Thüringen umlaut-free)', () => {
    expect(ids('Was plant MV zur Windkraft?')).toEqual(['mecklenburg-vorpommern-notebook']);
    expect(ids('Position der Böll Stiftung zu KI')).toEqual(['boell-stiftung-notebook']);
    expect(ids('Wahlprogramm Thueringen')).toEqual(['thueringen-notebook']);
  });

  it('returns every named notebook so the caller can offer both', () => {
    expect(ids('Vergleiche Berlin und Brandenburg beim ÖPNV')).toEqual([
      'berlin-notebook',
      'brandenburg-notebook',
    ]);
  });

  it('never matches the aggregate surface itself', () => {
    expect(ids('Was kann der Grünerator?')).toEqual([]);
  });

  it('ignores empty and single-character input', () => {
    expect(ids('')).toEqual([]);
    expect(ids('b')).toEqual([]);
  });
});

describe('detectQuestionIntent', () => {
  it('treats interrogative openers and question marks as questions', () => {
    expect(detectQuestionIntent('Was tun die Grünen Berlin für Hitzeschutz')).toBe(true);
    expect(detectQuestionIntent('Hitzeschutz in Berlin?')).toBe(true);
    expect(detectQuestionIntent('Fordern die Grünen ein Tempolimit')).toBe(true);
  });

  it('treats short keyword input as search', () => {
    expect(detectQuestionIntent('hitzeschutz')).toBe(false);
    expect(detectQuestionIntent('hitzeschutz berlin')).toBe(false);
  });

  it('treats long phrases as questions even without an opener', () => {
    expect(detectQuestionIntent('die wichtigsten Beschlüsse zum Klimaschutz seit 2023')).toBe(true);
  });
});

describe('matchTargetsByName', () => {
  it('matches title prefixes for open-notebook options', () => {
    expect(matchTargetsByName('berl', targets).map((t) => t.key)).toEqual(['berlin-notebook']);
  });

  it('requires at least two characters', () => {
    expect(matchTargetsByName('b', targets)).toEqual([]);
  });
});
