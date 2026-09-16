/**
 * The clamp is shared by three writers (the server's fallback and AI title, the
 * client's optimistic one), so what is pinned here is the lexicon: every
 * function word strips as a whole word, contractions strip like the preposition
 * they contract, and no clamp ever collapses a title to nothing.
 */

import { describe, expect, it } from 'vitest';

import { MAX_THREAD_TITLE_CHARS, clampThreadTitle } from './threadTitle.js';

describe('clampThreadTitle', () => {
  it('leaves a title that already fits', () => {
    expect(clampThreadTitle('Protokolle Juni/Juli')).toBe('Protokolle Juni/Juli');
  });

  it('cuts at a word boundary and never appends an ellipsis', () => {
    const title = clampThreadTitle('Analyse von Budget und Standortfragen der Verwaltung');
    expect(title).toBe('Analyse von Budget');
    expect(title).not.toContain('...');
    expect(title).not.toContain('…');
    expect(title.length).toBeLessThanOrEqual(MAX_THREAD_TITLE_CHARS);
  });

  it('strips a contraction exactly like the preposition it contracts', () => {
    // Half a pair would strip "… Kommunalverwaltung in" but keep "… ins".
    for (const word of ['in', 'ins', 'an', 'ans', 'auf', 'aufs', 'bei', 'beim', 'für', 'fürs']) {
      expect(clampThreadTitle(`Vorgaben Kommunalverwaltung ${word} Detailfragen`)).toBe(
        'Vorgaben Kommunalverwaltung'
      );
    }
  });

  it('does not eat a longer word that merely starts with a function word', () => {
    // The `\s+` prefix and the `$` anchor do this without needing a `\b`, which
    // is why neither "Umsetzung" nor "Forumsbeitrag" may be touched.
    expect(clampThreadTitle('Beschluss Fraktionssitzung Umsetzung')).toBe(
      'Beschluss Fraktionssitzung'
    );
    expect(clampThreadTitle('Beschluss Fraktionssitzung Forumsbeitrag')).toBe(
      'Beschluss Fraktionssitzung'
    );
  });

  it('takes a whole run of stranded function words, not just the last one', () => {
    expect(clampThreadTitle('Suche nach dem Windkraft-Beschluss')).toBe('Suche');
  });

  it('keeps a mid-word cut rather than returning a bare article', () => {
    // "Die Verwaltungsvorschriftenänderung" has its only word boundary after
    // the article, so a clean cut would leave a stub the reader cannot use.
    expect(clampThreadTitle('Die Verwaltungsvorschriftenänderung')).toBe(
      'Die Verwaltungsvorschriftenänder'
    );
  });

  it('never returns an empty title', () => {
    for (const text of [
      'Die Verwaltungsvorschriftenänderung',
      'Suche nach dem Windkraft-Beschluss',
      'Verwaltungsvorschriftenänderungsverordnungsentwurf',
      'der die das und oder für von mit im in am an auf zu',
    ]) {
      expect(clampThreadTitle(text).length).toBeGreaterThan(0);
    }
  });
});
