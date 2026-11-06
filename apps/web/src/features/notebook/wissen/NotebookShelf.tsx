import { landesverbandCoverForNotebook } from '@gruenerator/shared/marketplace';
import { ConfirmDialogProvider, ShowcasePhotoCard, cn } from '@gruenerator/ui';
import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { HiExclamation } from 'react-icons/hi';
import { Link, useNavigate } from 'react-router-dom';

import FavouriteStar from '../../../components/common/FavouriteStar';
import { useIsFavourite } from '../../../stores/sidebarFavouritesStore';
import { lvCardImage } from '../../marketplace/landesverbandCovers';
import { useNotebookPrefetch } from '../preload';

import { OwnNotebookMenu } from './OwnNotebookMenu';
import {
  collectionSlug,
  useNotebookShelves,
  type Shelf,
  type ShelfEntry,
} from './useNotebookShelves';
import { SHELF_GRID, SHELF_TILE, ShelfSection } from './WissenLayout';
import { Bone } from './WissenSkeletons';
import {
  WD_DISPLAY,
  WD_FOCUS,
  WD_HEADING,
  WD_INK_TEXT,
  WD_LINK,
  WD_MUTED,
  WD_SUB_TEXT,
  WD_TINT,
  WD_TINT_HOVER,
} from './wissenStyles';

const CREATE_PATH = '/notebooks/neu';
const OPEN_STATE = { freshConversation: true };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Was ein Listeneintrag zeigt und wohin er führt — je Art an genau einer Stelle. */
function describeEntry(entry: ShelfEntry): {
  title: string;
  meta: string;
  to: string;
  /** Slug für den Prefetch der Notebook-Daten; System-Notebooks laden nur den Seiten-Chunk. */
  prefetchSlug: string | null;
  action: ReactNode;
} {
  switch (entry.kind) {
    case 'system':
      return {
        title: entry.notebook.title,
        meta: entry.notebook.meta,
        to: entry.notebook.path,
        prefetchSlug: null,
        action: <FavouriteStar id={entry.notebook.id} size={16} tone="notebook" />,
      };
    case 'own': {
      const c = entry.collection;
      return {
        title: c.name,
        meta: plural(c.document_count, 'Quelle', 'Quellen'),
        to: `/notebooks/${collectionSlug(c)}`,
        prefetchSlug: collectionSlug(c),
        action: <OwnNotebookMenu collection={c} />,
      };
    }
    case 'shared': {
      const c = entry.collection;
      // Der Projektname unterscheidet zwei gleichnamige geteilte Notebooks.
      const via = c.shared_via_groups?.length ? ` via ${c.shared_via_groups.join(', ')}` : '';
      return {
        title: c.name,
        meta: `Geteilt${via}`,
        to: `/notebooks/${collectionSlug(c)}`,
        prefetchSlug: collectionSlug(c),
        action: null,
      };
    }
    case 'saved':
      return {
        title: entry.item.title,
        meta: entry.item.authorName ? `Gemerkt · von ${entry.item.authorName}` : 'Gemerkt',
        to: `/notebooks/${entry.item.notebook.slug}`,
        prefetchSlug: entry.item.notebook.slug,
        action: null,
      };
  }
}

/**
 * Ein Eintrag der aufgeklappten Liste: ab Tablet eine umrandete Karte (Aktion
 * oben rechts), auf dem Smartphone eine Zeile (Aktion am Ende).
 */
function ShelfItem({ entry }: { entry: ShelfEntry }) {
  const prefetch = useNotebookPrefetch();
  const { title, meta, to, prefetchSlug, action } = describeEntry(entry);
  const warm = () => (prefetchSlug ? prefetch(prefetchSlug) : prefetch());
  return (
    <li className="group relative flex items-center gap-1 max-md:min-h-12 max-md:border-b max-md:border-border max-md:last:border-b-0">
      <Link
        to={to}
        state={OPEN_STATE}
        onPointerEnter={warm}
        className={cn(
          'flex min-w-0 flex-1 no-underline max-md:items-center max-md:justify-between max-md:gap-2.5 max-md:py-2',
          'md:min-h-[76px] md:flex-col md:justify-end md:gap-[3px] md:rounded-[14px] md:border md:border-border md:bg-(--wd-card) md:px-4 md:py-3.5 md:pr-9 md:transition-colors md:hover:border-(--wd-mg)',
          'lg:min-h-[88px] lg:gap-1 lg:px-[18px] lg:py-4 lg:pr-10',
          WD_FOCUS
        )}
      >
        <span
          className={cn(
            'min-w-0 text-[15px] font-bold leading-[1.25] md:text-base lg:text-[17px]',
            'md:font-[family-name:Raleway,PT_Sans,Arial,sans-serif]',
            WD_INK_TEXT
          )}
        >
          {title}
        </span>
        <span className={cn('text-[13px] max-md:shrink-0 max-md:text-right', WD_MUTED)}>
          {meta}
        </span>
      </Link>
      {action && <div className="shrink-0 md:absolute md:right-1.5 md:top-1.5">{action}</div>}
    </li>
  );
}

/** Kachel-Inhalt: Chevron (nur aufklappbare) oben rechts, Name und Zeile unten. */
// Fotoreihe wie im Marktplatz: Kachelbreite = (Reihe − Abstände) ÷ eine
// .5-Anzahl, damit die nächste Karte halb sichtbar bleibt und das Scrollen zeigt.
const PHOTO_ROW = 'm-0 flex list-none gap-3 overflow-x-auto p-0 pt-1 pb-3 sm:gap-4';
const PHOTO_ITEM =
  'min-w-0 shrink-0 basis-[calc((100%_-_1.5rem)_*_0.4)] sm:basis-[calc((100%_-_3rem)_*_0.2857)] md:basis-[calc((100%_-_4rem)_*_0.2222)] lg:basis-[calc((100%_-_5rem)_*_0.1818)]';

/**
 * Ein Landesverband als Fotokarte — dasselbe Foto wie im Marktplatz. Ohne Foto
 * (z. B. der Bundesverband) bleibt es die Textkarte.
 */
function PhotoShelfItem({ entry }: { entry: ShelfEntry }) {
  const navigate = useNavigate();
  const prefetch = useNotebookPrefetch();
  const notebook = entry.kind === 'system' ? entry.notebook : null;
  const cover = notebook ? landesverbandCoverForNotebook(notebook.id) : null;
  const starred = useIsFavourite(notebook?.id ?? '');
  if (!notebook || !cover) {
    return (
      <li className={PHOTO_ITEM}>
        <ul className="m-0 h-full list-none p-0">
          <ShelfItem entry={entry} />
        </ul>
      </li>
    );
  }
  return (
    <li className={cn(PHOTO_ITEM, 'group relative')} onPointerEnter={() => prefetch()}>
      <ShowcasePhotoCard
        title={notebook.title}
        href={notebook.path}
        onActivate={(event) => {
          event.preventDefault();
          void navigate(notebook.path, { state: OPEN_STATE });
        }}
        {...lvCardImage(cover)}
        headingLevel={4}
        className="aspect-square"
      />
      {/* Der graue Stern ist auf einem Foto unlesbar; ungesetzt erscheint er erst beim Hover, seine Pille auch. */}
      <div
        className={cn(
          'absolute right-2 top-2 z-20 rounded-full transition-colors duration-200',
          starred
            ? 'bg-white/85 backdrop-blur-sm dark:bg-black/50'
            : 'group-hover:bg-white/85 group-hover:backdrop-blur-sm group-focus-within:bg-white/85 dark:group-hover:bg-black/50 dark:group-focus-within:bg-black/50'
        )}
      >
        <FavouriteStar id={notebook.id} size={16} tone="notebook" />
      </div>
    </li>
  );
}

/** `expanded: null` = Kachel klappt nichts auf, kein Chevron. */
function TileBody({ shelf, expanded }: { shelf: Shelf; expanded: boolean | null }) {
  return (
    <>
      {/* Auf dem Smartphone ohne Pfeil: die Kacheln sind klein, den offenen Zustand zeigt der Rahmen. */}
      <span className="flex justify-end max-md:hidden md:min-h-[15px] lg:min-h-4">
        {expanded !== null && (
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 transition-transform duration-200 motion-reduce:transition-none',
              'text-(--wd-mg)',
              expanded && 'rotate-180'
            )}
          />
        )}
      </span>
      <span className="flex flex-col gap-0.5 md:gap-[3px] lg:gap-1">
        <span
          className={cn(
            // Mit Seitenleiste sind die Kacheln schmaler als im Entwurf: 16 px auf dem
            // Tablet, 18 auf dem schmalen Desktop, 21 erst ab xl. Trennen nur als
            // Notnagel auf sehr schmalen Telefonen („Landes-verbände" bei 320 px).
            'break-words text-[17px] font-bold leading-[1.2] hyphens-auto md:text-base lg:text-lg xl:text-[21px]',
            WD_DISPLAY,
            WD_INK_TEXT
          )}
        >
          {shelf.title}
        </span>
        {shelf.meta === null ? (
          <Bone className="h-3.5 w-24 bg-(--wd-mg-tint-2)" />
        ) : (
          <span className={cn('text-[13px] lg:text-sm', WD_SUB_TEXT)}>{shelf.meta}</span>
        )}
      </span>
    </>
  );
}

const tileClass = (open: boolean) =>
  cn(
    SHELF_TILE,
    WD_TINT,
    WD_TINT_HOVER,
    'cursor-pointer border-0 transition-colors',
    open && 'shadow-[inset_0_0_0_2px_var(--wd-mg)]',
    WD_FOCUS
  );

type PhotoRow = Extract<Shelf, { kind: 'group' }>;
// Bewusst kein Typ-Guard: negiert würde er für TypeScript alle Gruppen ausschließen.
const isPhotoRow = (s: Shelf): boolean => s.kind === 'group' && s.layout === 'photos';

/**
 * „Deine Notebooks": Kacheln für die Notebook-Gruppen. Eine Gruppe klappt
 * darunter ihre Liste auf (immer nur eine), ein einzelnes Notebook öffnet direkt.
 */
export function NotebookShelf() {
  const { shelves, vectorStoreDown } = useNotebookShelves();
  const prefetch = useNotebookPrefetch();
  const [openId, setOpenId] = useState<string | null>(null);
  const panelId = useId();
  // Fotogruppen (Landesverbände) stehen als eigene, immer sichtbare Reihe unter
  // den Kacheln; alle übrigen sind Kacheln.
  const photoRows = shelves.filter((s): s is PhotoRow => isPhotoRow(s));
  const tiles = shelves.filter((s) => !isPhotoRow(s));
  const open = tiles.find((s) => s.id === openId && s.kind === 'group') ?? null;

  return (
    <ShelfSection
      header={
        <>
          <h2 className={cn('m-0 text-[19px] md:text-[22px] lg:text-2xl', WD_HEADING)}>
            Deine Notebooks
          </h2>
          <Link to={CREATE_PATH} className={cn('py-3 text-[15px] lg:py-0', WD_LINK)}>
            Neues erstellen
          </Link>
        </>
      }
    >
      {vectorStoreDown && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <HiExclamation size={18} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Die Wissensdatenbank ist gerade nicht erreichbar. Eigene Notebooks können vorübergehend
            nicht geladen oder befragt werden – bitte versuche es später erneut.
          </span>
        </div>
      )}

      <div className={SHELF_GRID}>
        {tiles.map((shelf) => {
          if (shelf.kind === 'group') {
            const isOpen = open?.id === shelf.id;
            return (
              <button
                key={shelf.id}
                type="button"
                aria-expanded={isOpen}
                {...(isOpen ? { 'aria-controls': panelId } : {})}
                onClick={() => setOpenId(isOpen ? null : shelf.id)}
                className={tileClass(isOpen)}
              >
                <TileBody shelf={shelf} expanded={isOpen} />
              </button>
            );
          }
          const to = shelf.kind === 'notebook' ? shelf.notebook.path : CREATE_PATH;
          return (
            <Link
              key={shelf.id}
              to={to}
              state={shelf.kind === 'notebook' ? OPEN_STATE : null}
              onPointerEnter={() => shelf.kind === 'notebook' && prefetch()}
              className={tileClass(false)}
            >
              <TileBody shelf={shelf} expanded={null} />
            </Link>
          );
        })}
      </div>

      {open?.kind === 'group' && (
        <div id={panelId} className="flex flex-col gap-3">
          <h3 className={cn('m-0 text-lg max-lg:sr-only', WD_HEADING)}>{open.title}</h3>
          <ConfirmDialogProvider>
            <ul
              className={cn(
                'm-0 list-none p-0',
                'max-md:flex max-md:flex-col max-md:rounded-2xl max-md:bg-(--wd-card) max-md:px-[18px] max-md:py-0.5',
                'md:grid md:grid-cols-3 md:gap-2.5 lg:grid-cols-4 lg:gap-3'
              )}
            >
              {open.entries.map((entry) => (
                <ShelfItem key={entry.key} entry={entry} />
              ))}
            </ul>
          </ConfirmDialogProvider>
        </div>
      )}

      {photoRows.map((row) => (
        <section
          key={row.id}
          aria-labelledby={`${panelId}-${row.id}`}
          className="flex flex-col gap-3"
        >
          <h3 id={`${panelId}-${row.id}`} className={cn('m-0 text-lg md:text-xl', WD_HEADING)}>
            {row.title}
          </h3>
          <ul className={PHOTO_ROW}>
            {row.entries.map((entry) => (
              <PhotoShelfItem key={entry.key} entry={entry} />
            ))}
          </ul>
        </section>
      ))}
    </ShelfSection>
  );
}
