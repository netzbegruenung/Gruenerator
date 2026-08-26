import { filterMentionables, type Mentionable } from './mentionables';

export interface MentionSubgroup {
  sublabel: string;
  items: Mentionable[];
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

  // Recipes lost their own '/' trigger, so they lead the combined list.
  // "Aus deinen Gruppen" stays a separate sublabel: a shared recipe is
  // usable right away, but it should never look like one of your own.
  const recipeGroups: MentionSubgroup[] = [];
  const ownRecipes = customAgents.filter((m) => !m.sharedFromGroup);
  const sharedRecipes = customAgents.filter((m) => m.sharedFromGroup);
  if (agents.length > 0) recipeGroups.push({ sublabel: 'mitgeliefert', items: agents });
  if (ownRecipes.length > 0) recipeGroups.push({ sublabel: 'eigene', items: ownRecipes });
  if (sharedRecipes.length > 0) {
    recipeGroups.push({ sublabel: 'aus deinen Gruppen', items: sharedRecipes });
  }

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
