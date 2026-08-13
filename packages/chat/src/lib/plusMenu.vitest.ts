/**
 * What the composer's "+" menu offers.
 *
 * The menu used to render one flat "Funktionen" list built from every intent
 * that carried a mention, which mixed three unrelated things: making an artefact
 * (`@bildgenerieren`), looking a source up (`@bundestag`), and switching a
 * setting (`@recherche`). The split is now the registry's own `category`, so
 * these tests guard the two ways that can rot:
 *
 *  1. a retrieval intent leaking back into "Erstellen" (the pile returns), and
 *  2. a create-a-surface entry silently dropping out — those four live OUTSIDE
 *     the intent registry and were typeahead-only for exactly that reason.
 */

import { describe, expect, it } from 'vitest';

import { setMentionLocale } from './mentionables';
import { creationMentionables, functionMentionables } from './plusMenu';

const mentions = (list: { mention: string }[]) => list.map((m) => m.mention);

describe('creationMentionables', () => {
  it('offers the generation intents', () => {
    const got = mentions(creationMentionables());
    for (const slug of [
      'bildgenerieren',
      'social',
      'diagramm',
      'pdf-erstellen',
      'zusammenfassung',
    ]) {
      expect(got).toContain(slug);
    }
  });

  it('drops the web-only entries where there is no browser', () => {
    // `@sharepic` is `availability: 'web-only'` — the canvas editor that renders
    // it has no React Native runtime. This lane has no `document`, so it stands
    // in for the mobile bundle: the entry must not appear there.
    expect(mentions(creationMentionables())).not.toContain('sharepic');
  });

  it('offers the four create-a-surface entries that live outside the intent registry', () => {
    // These are `type: 'doc' | 'sheet' | 'presentation' | 'board'`, and the old
    // menu rendered `type: 'tool'` only — so they were reachable by typing and
    // nowhere else. Losing them again would be invisible in the UI.
    const got = mentions(creationMentionables());
    expect(got).toContain('dokument-erstellen');
    expect(got).toContain('tabelle-erstellen');
    expect(got).toContain('praesentation-erstellen');
    expect(got).toContain('board-erstellen');
  });

  it('offers no retrieval intent — looking something up is not a create action', () => {
    const got = mentions(creationMentionables());
    for (const slug of [
      'bundestag',
      'abgeordnetenwatch',
      'umfragen',
      'dokumente',
      'verlauf',
      'doku',
      'beispiele',
      'pressemitteilungen',
      'recherche',
      'deepresearch',
    ]) {
      expect(got).not.toContain(slug);
    }
  });

  it('does not offer the document PICKER, only document creation', () => {
    // `@docs` ("Dokument einfügen") is an attach action and sits in the menu's
    // first group; it shares `type: 'doc'` with `@dokument-erstellen`, so a
    // type-only filter would pull it in here too.
    expect(mentions(creationMentionables())).not.toContain('docs');
  });

  it('is locale-filtered like the rest of the menu', () => {
    setMentionLocale('de-AT');
    try {
      // `stadtbegruenen` is `audience: 'all'`, so it must survive the AT filter —
      // proving the list is filtered rather than emptied.
      expect(mentions(creationMentionables())).toContain('stadtbegruenen');
      expect(mentions(creationMentionables())).not.toContain('bundestag');
    } finally {
      setMentionLocale('de-DE');
    }
  });

  it('is a strict subset of the full function list', () => {
    const all = new Set(mentions(functionMentionables()));
    const creation = mentions(creationMentionables()).filter(
      // the four surface entries are not intent mentions
      (m) =>
        ![
          'dokument-erstellen',
          'tabelle-erstellen',
          'praesentation-erstellen',
          'board-erstellen',
        ].includes(m)
    );
    for (const slug of creation) expect(all).toContain(slug);
    expect(creation.length).toBeLessThan(all.size);
  });
});
