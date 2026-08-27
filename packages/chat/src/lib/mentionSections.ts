import { filterMentionables, type Mentionable } from './mentionables';

export interface MentionSubgroup {
  sublabel: string;
  items: Mentionable[];
}

/**
 * Where a recipe in the picker came from. Everything in the recipe section is
 * usable right away, but it must never claim an origin it does not have — a
 * colleague's recipe listed as one of your own is what #2876 was about.
 *
 * `'own'` is the fallback, so a source that carries no origin at all stays in
 * the user's own bucket rather than inventing one.
 */
export type RecipeOrigin = 'bundled' | 'own' | 'group' | 'saved';

/** Reading order of the recipe subgroups. */
const RECIPE_ORIGIN_ORDER: readonly RecipeOrigin[] = ['bundled', 'own', 'group', 'saved'];

/** Sublabels inside the popover's single "Rezepte" section (web/desktop). */
export const RECIPE_ORIGIN_SUBLABELS: Record<RecipeOrigin, string> = {
  bundled: 'mitgeliefert',
  own: 'eigene',
  group: 'aus deinen Gruppen',
  saved: 'von anderen',
};

/**
 * Standalone section titles for platforms whose list has only one heading level
 * (mobile's `SectionList`). Kept beside the sublabels on purpose: the wording
 * differs per platform, the *split* must not — `Record<RecipeOrigin, string>`
 * makes a new origin fail to compile until both are filled in.
 */
export const RECIPE_ORIGIN_SECTION_TITLES: Record<RecipeOrigin, string> = {
  bundled: 'Rezepte',
  own: 'Meine Rezepte',
  group: 'Rezepte aus deinen Gruppen',
  saved: 'Rezepte von anderen',
};

/** The origin a recipe mentionable carries, `'own'` when it carries none. */
export function recipeOriginOf(m: Mentionable): Exclude<RecipeOrigin, 'bundled'> {
  if (m.sharedFromGroup) return 'group';
  if (m.savedFromOwner !== undefined) return 'saved';
  return 'own';
}

/**
 * The one split of the recipe list, in reading order, empty buckets dropped.
 *
 * Both the popover and mobile's `SectionList` call this instead of filtering on
 * `sharedFromGroup` themselves. A second hand-kept copy of the rule is how the
 * picker drifted before (#2874), and #2876 warned that repairing one half while
 * mobile rebuilt the split would tear the same seam open again.
 */
export function splitRecipesByOrigin(
  bundled: Mentionable[],
  userRecipes: Mentionable[]
): Array<{ origin: RecipeOrigin; items: Mentionable[] }> {
  const byOrigin = new Map<RecipeOrigin, Mentionable[]>([['bundled', bundled]]);
  for (const m of userRecipes) {
    const origin = recipeOriginOf(m);
    const bucket = byOrigin.get(origin);
    if (bucket) bucket.push(m);
    else byOrigin.set(origin, [m]);
  }
  return RECIPE_ORIGIN_ORDER.map((origin) => ({
    origin,
    items: byOrigin.get(origin) ?? [],
  })).filter((g) => g.items.length > 0);
}

export type MentionSection =
  | { kind: 'flat'; label: string; items: Mentionable[] }
  | { kind: 'grouped'; label: string; groups: MentionSubgroup[] };

/**
 * The one order the mention picker has. The popover renders these sections and
 * the composer's arrow keys walk `flattenMentionSections` of the same result —
 * so the entry behind `selectedIndex` is always the one that is highlighted.
 *
 * Keep it that way: a second, hand-kept list of the same categories is how the
 * two drifted apart before (#2874 — @vorlagen was keyboard-only, "meine"
 * notebooks were display-only, and split recipes shifted every index after
 * the first one).
 */
export function buildMentionSections(query: string): MentionSection[] {
  const {
    agents,
    customAgents,
    notebooks,
    userNotebooks,
    tools,
    boards,
    docs,
    documents,
    wolke,
    connect,
    canva,
    vorlagen,
  } = filterMentionables(query);

  // Recipes lost their own '/' trigger, so they lead the combined list. The
  // origin split lives in `splitRecipesByOrigin` so mobile can use the same one.
  const recipeGroups: MentionSubgroup[] = splitRecipesByOrigin(agents, customAgents).map(
    ({ origin, items }) => ({ sublabel: RECIPE_ORIGIN_SUBLABELS[origin], items })
  );

  const notebookGroups: MentionSubgroup[] = [];
  if (userNotebooks.length > 0) {
    notebookGroups.push({ sublabel: 'meine', items: userNotebooks });
  }
  if (notebooks.length > 0) {
    notebookGroups.push({ sublabel: 'system', items: notebooks });
  }

  const all: MentionSection[] = [
    ...(recipeGroups.length > 0
      ? [{ kind: 'grouped' as const, label: 'Rezepte', groups: recipeGroups }]
      : []),
    { kind: 'flat', label: 'Werkzeuge', items: tools },
    { kind: 'flat', label: 'Boards', items: boards },
    { kind: 'flat', label: 'Dokumente', items: docs },
    { kind: 'flat', label: 'Dateien', items: documents },
    { kind: 'flat', label: 'Wolke', items: wolke },
    { kind: 'flat', label: 'Verbundene Accounts', items: connect },
    { kind: 'flat', label: 'Canva', items: canva },
    { kind: 'flat', label: 'Vorlagen', items: vorlagen },
    ...(notebookGroups.length > 0
      ? [{ kind: 'grouped' as const, label: 'Notizbücher', groups: notebookGroups }]
      : []),
  ];

  return all.filter((s) =>
    s.kind === 'flat' ? s.items.length > 0 : s.groups.some((g) => g.items.length > 0)
  );
}

/** Reading order of the rendered sections — the index space of `selectedIndex`. */
export function flattenMentionSections(sections: MentionSection[]): Mentionable[] {
  return sections.flatMap((s) => (s.kind === 'flat' ? s.items : s.groups.flatMap((g) => g.items)));
}

export function countMentionSectionItems(sections: MentionSection[]): number {
  return sections.reduce(
    (sum, s) =>
      sum + (s.kind === 'flat' ? s.items.length : s.groups.reduce((n, g) => n + g.items.length, 0)),
    0
  );
}
