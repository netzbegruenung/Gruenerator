import { searchIntentSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  CHAT_INTENTS,
  ALL_CHAT_INTENTS,
  allIntentMentions,
  forcedToolFor,
  isIntentAllowedForLocale,
  degradeTargetForLocale,
  intentToolNames,
  type ChatIntentId,
} from './index.js';

// ---------------------------------------------------------------------------
// Behaviour-neutrality proof.
//
// These fixtures are the state of the code BEFORE the registry existed, copied
// verbatim. As long as they hold, introducing the registry changed nothing that
// a user or a stored thread can observe — which is the whole claim of this
// refactor. When a later stage deliberately changes one of them (e.g. adding a
// mention), the fixture changes in THAT commit, visibly.
// ---------------------------------------------------------------------------

/** `packages/chat/src/lib/toolMappings.ts` before the registry: the shared 7. */
const CLIENT_INTENT_TO_TOOL_BEFORE: Record<string, string> = {
  search: 'gruenerator_search',
  web: 'web_search',
  research: 'web_search',
  examples: 'gruenerator_examples_search',
  pressemitteilung_examples: 'gruenerator_pressemitteilung_examples',
  bundestag: 'bundestag',
  chat_history: 'search_chat_history',
};

/** `apps/api/.../postResponseService.ts` before the registry: shared 7 + 5. */
const SERVER_INTENT_TO_TOOL_BEFORE: Record<string, string> = {
  ...CLIENT_INTENT_TO_TOOL_BEFORE,
  image: 'image_generate',
  image_edit: 'image_edit',
  sharepic: 'sharepic',
  social_post: 'social_post',
  scrape_url: 'scrape_url',
};

/**
 * `toolMentionables` in `packages/chat/src/lib/mentionables.ts` before the
 * registry, in picker order: [slug, forcedTool, audience-or-undefined].
 */
const TOOL_MENTIONS_BEFORE: Array<[string, string, string | undefined]> = [
  ['recherche', 'research', undefined],
  ['dokumente', 'search', undefined],
  ['doku', 'hilfe', 'all'],
  ['umfragen', 'umfragen', 'all'],
  ['abgeordnetenwatch', 'abgeordnetenwatch', 'de-DE'],
  ['bundestag', 'bundestag', 'de-DE'],
  ['zusammenfassung', 'summary', undefined],
  ['pdf-erstellen', 'pdf-erstellen', undefined],
  ['bildgenerieren', 'image', undefined],
  ['stadtbegruenen', 'image_edit', undefined],
  ['bildbearbeiten', 'image_edit_universal', undefined],
  ['sharepic', 'sharepic', undefined],
];

/**
 * Mentions added ON PURPOSE after the registry landed: intents the backend
 * could already serve but which no `@` could reach, so a user had to hope the
 * classifier guessed right. Kept as a separate list so the fixture above stays
 * readable as "what the hand-written array contained".
 */
const TOOL_MENTIONS_ADDED: Array<[string, string, string | undefined]> = [
  ['beispiele', 'examples', undefined],
  ['pressemitteilungen', 'pressemitteilung_examples', undefined],
  ['verlauf', 'chat_history', undefined],
  ['wetter', 'wetter', undefined],
  ['social', 'social_post', undefined],
  ['diagramm', 'chart', undefined],
  ['rechnen', 'compute', undefined],
];

describe('registry totality', () => {
  it('describes every intent in the wire enum, and no others', () => {
    expect(Object.keys(CHAT_INTENTS).sort()).toEqual([...searchIntentSchema.options].sort());
  });

  it('every entry carries its own id as key', () => {
    for (const [key, def] of Object.entries(CHAT_INTENTS)) expect(def.id).toBe(key);
  });

  it('exposes them in enum order', () => {
    expect(ALL_CHAT_INTENTS.map((i) => i.id)).toEqual([...searchIntentSchema.options]);
  });
});

describe('intent → tool names match the pre-registry maps exactly', () => {
  it('client map', () => {
    expect(intentToolNames().ui).toEqual(CLIENT_INTENT_TO_TOOL_BEFORE);
  });

  it('server map', () => {
    expect(intentToolNames().persist).toEqual(SERVER_INTENT_TO_TOOL_BEFORE);
  });

  it('the server map stays a superset of the client map', () => {
    const { ui, persist } = intentToolNames();
    for (const [intent, tool] of Object.entries(ui)) expect(persist[intent]).toBe(tool);
  });
});

describe('mentions match the pre-registry picker exactly', () => {
  it('same slugs, same forced tools, same order', () => {
    const derived = allIntentMentions().map(
      ({ intent, mention }) =>
        [mention.slug, mention.forcedTool ?? forcedToolFor(intent), intent.audience] as const
    );
    // The registry orders by the enum; the old array was hand-ordered. Compare
    // as sets of [slug, forcedTool] — order in the picker is a display concern
    // handled where the picker is built, not a claim of this registry.
    const norm = (rows: readonly (readonly [string, string, string | undefined])[]) =>
      rows.map(([slug, tool]) => `${slug}→${tool}`).sort();
    expect(norm(derived)).toEqual(norm([...TOOL_MENTIONS_BEFORE, ...TOOL_MENTIONS_ADDED]));
  });

  it('keeps the audience each mention had', () => {
    for (const [slug, , audience] of [...TOOL_MENTIONS_BEFORE, ...TOOL_MENTIONS_ADDED]) {
      const found = allIntentMentions().find((m) => m.mention.slug === slug);
      expect(found, `mention @${slug} vanished`).toBeDefined();
      // `undefined` meant "no audience field", which resolved to all.
      expect(found?.intent.audience).toBe(audience ?? 'all');
    }
  });

  it('never offers a mention for a surface-edit or internal intent', () => {
    for (const intent of ALL_CHAT_INTENTS) {
      if (intent.category === 'surface-edit' || intent.category === 'internal') {
        expect('mention' in intent).toBe(false);
      }
    }
  });
});

describe('locale rules', () => {
  it('gates the two DE-only sources and lets everything else through', () => {
    expect(isIntentAllowedForLocale('bundestag', 'de-AT')).toBe(false);
    expect(isIntentAllowedForLocale('abgeordnetenwatch', 'de-AT')).toBe(false);
    expect(isIntentAllowedForLocale('bundestag', 'de-DE')).toBe(true);
    expect(isIntentAllowedForLocale('umfragen', 'de-AT')).toBe(true);
    expect(isIntentAllowedForLocale('hilfe', 'de-AT')).toBe(true);
    expect(isIntentAllowedForLocale('wetter', 'de-AT')).toBe(true);
  });

  it('treats a missing locale as de-DE, like the backend default', () => {
    expect(isIntentAllowedForLocale('bundestag', null)).toBe(true);
    expect(isIntentAllowedForLocale('bundestag', undefined)).toBe(true);
  });

  it('degrades only on a mismatch, and only to an all-audience target', () => {
    expect(degradeTargetForLocale('bundestag', 'de-AT')).toBe('web');
    expect(degradeTargetForLocale('bundestag', 'de-DE')).toBeUndefined();
    for (const intent of ALL_CHAT_INTENTS) {
      if (!intent.degradeTo) continue;
      expect(
        CHAT_INTENTS[intent.degradeTo].audience,
        `${intent.id} degrades to a gated intent`
      ).toBe('all');
    }
  });

  it('every non-all intent declares both a degrade target and a decline note', () => {
    for (const intent of ALL_CHAT_INTENTS) {
      if (intent.audience === 'all') continue;
      expect(intent.degradeTo, `${intent.id} has no degradeTo`).toBeDefined();
      expect(intent.declineNote, `${intent.id} has no declineNote`).toBeTruthy();
    }
  });
});

describe('mention slugs are unique', () => {
  it('no two mentions claim the same slug or alias', () => {
    const seen = new Set<string>();
    for (const { mention } of allIntentMentions()) {
      for (const key of [mention.slug, ...(mention.aliases ?? [])]) {
        expect(seen.has(key), `duplicate mention key @${key}`).toBe(false);
        seen.add(key);
      }
    }
  });
});

describe('artifact intents', () => {
  it('name the forced tool their create-route dispatches on', () => {
    const artifacts = ALL_CHAT_INTENTS.filter((i) => i.category === 'artifact');
    const byId = Object.fromEntries(
      artifacts.map((i) => [i.id, i.category === 'artifact' ? i.forcedTool : null])
    ) as Record<ChatIntentId, string | null>;
    expect(byId.save_as_doc).toBe('dokument-erstellen');
    expect(byId.create_sheet).toBe('sheet-erstellen');
    expect(byId.create_presentation).toBe('praesentation-erstellen');
    expect(byId.create_pdf).toBe('pdf-erstellen');
    // Deliberately none: reached by classification only.
    expect(byId.create_recurring_task).toBeNull();
  });
});
