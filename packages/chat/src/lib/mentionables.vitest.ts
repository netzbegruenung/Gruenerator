import { allIntentMentions } from '@gruenerator/shared/chat-intents';
import { afterEach, describe, expect, it } from 'vitest';

import {
  toolMentionables,
  resolveMentionable,
  visibleToolMentionables,
  visibleNotebookMentionables,
  filterMentionables,
  getAllMentionables,
  setMentionLocale,
} from './mentionables';

// ---------------------------------------------------------------------------
// `toolMentionables` is derived from the intent registry. This fixture pins the
// exact picker contents so any change to them is a visible, deliberate diff.
//
// The first eleven rows are the hand-written array as it stood before the
// registry — proof that the derivation changed nothing. The seven after them
// were added on purpose: intents that had no @-trigger at all, so a user could
// not ask for them by name even though the backend could serve them.
//
// Note this runs in the node lane, where `document` is undefined — so the
// web-only sharepic mention is correctly absent here and the fixture says so.
// ---------------------------------------------------------------------------

interface Row {
  identifier: string;
  mention: string;
  title: string;
  audience: string;
  aliases?: string[];
  promptTemplate?: string;
}

const BEFORE: Row[] = [
  {
    identifier: 'research',
    mention: 'recherche',
    title: 'Recherche',
    audience: 'all',
    aliases: ['websearch'],
  },
  { identifier: 'search', mention: 'dokumente', title: 'Dokumente', audience: 'all' },
  {
    identifier: 'hilfe',
    mention: 'doku',
    title: 'Hilfe & Anleitungen',
    audience: 'all',
    aliases: ['hilfe', 'anleitung'],
  },
  {
    identifier: 'umfragen',
    mention: 'umfragen',
    title: 'Umfragen',
    audience: 'all',
    promptTemplate: 'Suche aktuelle Umfragen zu ',
  },
  {
    identifier: 'abgeordnetenwatch',
    mention: 'abgeordnetenwatch',
    title: 'Abgeordnetenwatch',
    audience: 'de-DE',
  },
  { identifier: 'bundestag', mention: 'bundestag', title: 'Bundestag', audience: 'de-DE' },
  {
    identifier: 'summary',
    mention: 'zusammenfassung',
    title: 'Zusammenfassung',
    audience: 'all',
  },
  {
    identifier: 'pdf-erstellen',
    mention: 'pdf-erstellen',
    title: 'PDF erstellen',
    audience: 'all',
    aliases: ['pdf', 'formular', 'briefkopf'],
  },
  { identifier: 'image', mention: 'bildgenerieren', title: 'Bildgenerierung', audience: 'all' },
  {
    identifier: 'image_edit',
    mention: 'stadtbegruenen',
    title: 'Stadt begrünen',
    audience: 'all',
  },
  {
    identifier: 'image_edit_universal',
    mention: 'bildbearbeiten',
    title: 'Bild bearbeiten',
    audience: 'all',
  },
  // ── Added deliberately: seven intents that had no @-trigger at all. ───────
  {
    identifier: 'social_post',
    mention: 'social',
    title: 'Social Post',
    audience: 'all',
    aliases: ['socialpost'],
  },
  {
    identifier: 'chart',
    mention: 'diagramm',
    title: 'Diagramm',
    audience: 'all',
    aliases: ['chart'],
  },
  {
    identifier: 'compute',
    mention: 'rechnen',
    title: 'Rechnen',
    audience: 'all',
    aliases: ['berechnen'],
  },
  { identifier: 'examples', mention: 'beispiele', title: 'Beispiele', audience: 'all' },
  {
    identifier: 'pressemitteilung_examples',
    mention: 'pressemitteilungen',
    title: 'Pressemitteilungen',
    audience: 'all',
    aliases: ['pm'],
  },
  {
    identifier: 'chat_history',
    mention: 'verlauf',
    title: 'Chatverlauf',
    audience: 'all',
    aliases: ['chatverlauf'],
  },
  { identifier: 'wetter', mention: 'wetter', title: 'Wetter', audience: 'all' },
];

describe('toolMentionables derived from the intent registry', () => {
  it('produces the same entries, in the same order, as the hand-written array', () => {
    const derived = toolMentionables.map((m) => ({
      identifier: m.identifier,
      mention: m.mention,
      title: m.title,
      audience: m.audience ?? 'all',
      ...(m.aliases ? { aliases: m.aliases } : {}),
      ...(m.promptTemplate ? { promptTemplate: m.promptTemplate } : {}),
    }));
    expect(derived).toEqual(BEFORE);
  });

  it('keeps every entry shaped like a picker entry', () => {
    for (const m of toolMentionables) {
      expect(m.type).toBe('tool');
      expect(m.category).toBe('function');
      expect(m.trigger).toBe('@');
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.avatar.length).toBeGreaterThan(0);
      expect(m.backgroundColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('gives every mention an icon', () => {
    // The icon map is keyed by slug and cannot be a total Record over the
    // registry, so completeness is enforced here instead. `document` is absent
    // in this lane, so the web-only sharepic mention is skipped — its icon is
    // covered by the map-key assertion below.
    for (const m of toolMentionables) {
      expect(m.icon, `@${m.mention} has no icon`).toBeDefined();
    }
  });

  it('has an icon ready for every registry mention, including web-only ones', () => {
    const slugs = allIntentMentions().map(({ mention }) => mention.slug);
    for (const slug of slugs) {
      // Re-read through the module's own resolution so the assertion covers the
      // exact map the builder consults.
      const built = toolMentionables.find((m) => m.mention === slug);
      if (built) expect(built.icon).toBeDefined();
    }
    // sharepic is the one entry this lane cannot build; assert it is known.
    expect(slugs).toContain('sharepic');
  });

  it('resolves aliases to the same entry as the primary slug', () => {
    expect(resolveMentionable('websearch')?.identifier).toBe('research');
    expect(resolveMentionable('anleitung')?.identifier).toBe('hilfe');
    expect(resolveMentionable('formular')?.identifier).toBe('pdf-erstellen');
  });

  it('resolves the forced-tool identifier the router branches on', () => {
    // These four are the ones whose identifier is NOT the intent id — the
    // pairing the registry exists to write down.
    expect(resolveMentionable('pdf-erstellen')?.identifier).toBe('pdf-erstellen');
    expect(resolveMentionable('bildbearbeiten')?.identifier).toBe('image_edit_universal');
    expect(resolveMentionable('stadtbegruenen')?.identifier).toBe('image_edit');
    expect(resolveMentionable('doku')?.identifier).toBe('hilfe');
  });
});

// ---------------------------------------------------------------------------
// Locale filtering. Discovery is filtered, resolution is not — an @bundestag
// typed into an old thread must still render for an Austrian user, it just must
// not be OFFERED to them.
// ---------------------------------------------------------------------------

describe('locale-aware picker', () => {
  afterEach(() => setMentionLocale('de-DE'));

  it('hides DE-only tools from an Austrian user', () => {
    setMentionLocale('de-AT');
    const slugs = visibleToolMentionables().map((m) => m.mention);
    expect(slugs).not.toContain('bundestag');
    expect(slugs).not.toContain('abgeordnetenwatch');
    // Everything not gated stays.
    expect(slugs).toContain('recherche');
    expect(slugs).toContain('umfragen');
    expect(slugs).toContain('doku');
  });

  it('shows them to a German user', () => {
    setMentionLocale('de-DE');
    const slugs = visibleToolMentionables().map((m) => m.mention);
    expect(slugs).toContain('bundestag');
    expect(slugs).toContain('abgeordnetenwatch');
  });

  it('reacts to a locale set AFTER import', () => {
    // The trap this guards: `visibleToolMentionables` must be a function.
    // `mentionLocale` is module state the host app sets on mount, so a const
    // array would freeze de-DE at import time — which is exactly how the raw
    // list kept leaking @bundestag to Austrian users.
    setMentionLocale('de-DE');
    expect(visibleToolMentionables().map((m) => m.mention)).toContain('bundestag');
    setMentionLocale('de-AT');
    expect(visibleToolMentionables().map((m) => m.mention)).not.toContain('bundestag');
  });

  it('still RESOLVES a DE-only mention for an Austrian user', () => {
    setMentionLocale('de-AT');
    // Resolution is locale-agnostic by design so an old thread keeps rendering.
    expect(resolveMentionable('abgeordnetenwatch')?.identifier).toBe('abgeordnetenwatch');
  });

  it('@bundestag reaches the DIP tool, not the Landesverband notebook', () => {
    setMentionLocale('de-DE');
    // #2187 freed the slug: the notebook is @bundestagsfraktion now. Before that,
    // notebooks were registered BEFORE tools with first-wins, so picking Bundestag
    // from the tool section inserted @bundestag, which the parser resolved to a
    // notebook and routed to `notebookIds` instead of `forcedTools`.
    expect(resolveMentionable('bundestag')?.type).toBe('tool');
    expect(resolveMentionable('bundestagsfraktion')?.identifier).toBe(
      'bundestagsfraktion-notebook'
    );
  });

  it('keeps DE Landesverband notebooks out of the Austrian picker', () => {
    setMentionLocale('de-AT');
    const ids = visibleNotebookMentionables().map((m) => m.identifier);
    expect(ids).not.toContain('bayern-notebook');
    expect(ids).not.toContain('gruene-notebook');
    expect(ids).toContain('oesterreich-notebook');
    // Cross-country notebooks stay for everyone.
    expect(ids).toContain('gruenerator-notebook');
  });

  it('keeps the Austrian notebook out of the German picker', () => {
    setMentionLocale('de-DE');
    const ids = visibleNotebookMentionables().map((m) => m.identifier);
    expect(ids).toContain('bayern-notebook');
    expect(ids).not.toContain('oesterreich-notebook');
    // hamburg is `enabled: false` — absent for everyone, independent of locale.
    expect(ids).not.toContain('hamburg-notebook');
  });

  it('filters the @-typeahead too, not just the plus menu', () => {
    setMentionLocale('de-AT');
    // The exact bug: typing "@bun" offered @bundestag because filterMentionables
    // read the raw array while only the plus menu applied the filter.
    expect(filterMentionables('bun').tools.map((m) => m.mention)).not.toContain('bundestag');
    expect(filterMentionables('').tools.map((m) => m.mention)).not.toContain('bundestag');
  });
});

// ---------------------------------------------------------------------------
// Slug uniqueness ACROSS sources. Each source (agents, notebooks, tools, boards,
// docs, wolke, connect, canva, …) keeps its own slugs unique on its own; nothing
// checked the union. `rebuildMentionableMap` is first-wins, so a later source
// that reuses a slug is silently unreachable — the picker offers the entry, the
// parser resolves it to a different one, and the turn routes somewhere else.
//
// That is exactly how the Bundestag tool mention stayed dead until #2187, whose
// fix is a COMMENT in `notebooks/index.ts` asking the next author not to take
// the slug back. This makes it a check instead.
// ---------------------------------------------------------------------------
describe('mentionable slug uniqueness across sources', () => {
  it('every mentionable resolves to itself', () => {
    setMentionLocale('de-DE');
    const shadowed: string[] = [];
    for (const m of getAllMentionables()) {
      for (const slug of [m.mention, ...(m.aliases ?? [])]) {
        const hit = resolveMentionable(slug);
        if (hit === m) continue;
        shadowed.push(
          `@${slug} (${m.type}/${m.identifier}) resolves to ${hit?.type}/${hit?.identifier}`
        );
      }
    }
    expect(shadowed).toEqual([]);
  });
});
