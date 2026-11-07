/**
 * Das Modell hinter „Deine Notebooks" auf /wissen — als reine Funktion, damit Web
 * und App dieselben Kacheln in derselben Reihenfolge mit denselben Texten zeigen.
 * Die Aufrufer filtern vorher nach Sichtbarkeit (Locale, Instanz) und
 * {@link SHELF_HIDDEN_NOTEBOOK_IDS}.
 */

export interface ShelfNotebook {
  id: string;
  title: string;
  meta: string;
}

/** Ein Eintrag in der aufgeklappten Liste einer Kachel. */
export type ShelfEntry<NB, C, S> =
  | { kind: 'system'; key: string; notebook: NB }
  | { kind: 'own'; key: string; collection: C }
  | { kind: 'shared'; key: string; collection: C }
  | { kind: 'saved'; key: string; item: S };

/**
 * Eine Kachel unter „Deine Notebooks": klappt eine Liste auf (`entries`) oder
 * öffnet direkt ein Notebook (`notebook`). `meta` ist `null`, solange die
 * Zählung noch lädt.
 */
export type Shelf<NB, C, S> =
  | {
      id: string;
      kind: 'group';
      title: string;
      meta: string | null;
      entries: ShelfEntry<NB, C, S>[];
      /** `photos`: Fotokarten in einer Scroll-Reihe (Landesverbände), sonst Textkarten. */
      layout: 'photos' | 'cards';
    }
  | { id: string; kind: 'notebook'; title: string; meta: string; notebook: NB }
  | { id: string; kind: 'create'; title: string; meta: string };

/** Notebooks, die auf /wissen keine eigene Kachel bekommen. */
export const SHELF_HIDDEN_NOTEBOOK_IDS: readonly string[] = [
  'gruenerator-notebook',
  'gruenblog-notebook',
  'boell-stiftung-notebook',
  'abgeordnetenwatch-notebook',
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface NotebookShelvesInput<NB, C, S> {
  austrian: boolean;
  /** Bereits nach Locale gefiltert. */
  austrianNotebooks: NB[];
  laender: NB[];
  bundesverband: NB | null;
  parlamente: NB[];
  wiki: NB | null;
  own: C[];
  shared: C[];
  saved: S[];
  mineLoading: boolean;
}

/**
 * Deutschland: Landesverbände (mit dem Bundesverband vorn, wo die Instanz ihn
 * zeigt), Parlamente, Meine Notebooks, KommunalWiki. Österreich: die AT-Notebooks
 * und Meine Notebooks.
 */
export function buildNotebookShelves<
  NB extends ShelfNotebook,
  C extends { id: string },
  S extends { ref: string },
>(input: NotebookShelvesInput<NB, C, S>): Shelf<NB, C, S>[] {
  const { austrian, austrianNotebooks, laender, bundesverband, parlamente, wiki } = input;
  const { own, shared, saved, mineLoading } = input;

  const system = (nb: NB): ShelfEntry<NB, C, S> => ({ kind: 'system', key: nb.id, notebook: nb });

  const mineEntries: ShelfEntry<NB, C, S>[] = [
    ...own.map((c): ShelfEntry<NB, C, S> => ({ kind: 'own', key: `own-${c.id}`, collection: c })),
    ...shared.map((c): ShelfEntry<NB, C, S> => ({
      kind: 'shared',
      key: `shared-${c.id}`,
      collection: c,
    })),
    ...saved.map((item): ShelfEntry<NB, C, S> => ({
      kind: 'saved',
      key: `saved-${item.ref}`,
      item,
    })),
  ];
  const mine: Shelf<NB, C, S> =
    mineLoading || mineEntries.length > 0
      ? {
          id: 'meine',
          kind: 'group',
          title: 'Meine Notebooks',
          meta: mineLoading ? null : plural(mineEntries.length, 'Notebook', 'Notebooks'),
          entries: mineEntries,
          layout: 'cards',
        }
      : {
          id: 'meine',
          kind: 'create',
          title: 'Meine Notebooks',
          meta: 'Erstes Notebook anlegen',
        };

  const direct = (nb: NB): Shelf<NB, C, S> => ({
    id: nb.id,
    kind: 'notebook',
    title: nb.title,
    meta: nb.meta,
    notebook: nb,
  });

  if (austrian) return [...austrianNotebooks.map(direct), mine];

  const out: Shelf<NB, C, S>[] = [];
  if (laender.length > 0) {
    out.push({
      id: 'laender',
      kind: 'group',
      title: 'Landesverbände',
      meta: plural(laender.length, 'Landesverband', 'Landesverbände'),
      entries: [...(bundesverband ? [system(bundesverband)] : []), ...laender.map(system)],
      layout: 'photos',
    });
  } else if (bundesverband) {
    // bgst blendet die Landesverbände aus und ist zugleich die einzige
    // Instanz mit dem Bundesverband — dort steht er als eigene Kachel.
    out.push(direct(bundesverband));
  }
  if (parlamente.length > 0) {
    out.push({
      id: 'parlamente',
      kind: 'group',
      title: 'Parlamente',
      meta: plural(parlamente.length, 'Parlament', 'Parlamente'),
      entries: parlamente.map(system),
      layout: 'cards',
    });
  }
  out.push(mine);
  if (wiki) out.push(direct(wiki));
  return out;
}
