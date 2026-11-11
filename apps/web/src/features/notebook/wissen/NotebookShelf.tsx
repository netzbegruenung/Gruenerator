import { landesverbandCoverForNotebook } from '@gruenerator/shared/marketplace';
import { ConfirmDialogProvider, ShowcasePhotoCard, cn } from '@gruenerator/ui';
import { ChevronDown } from 'lucide-react';
import { memo, useCallback, useId, useState, type ReactNode } from 'react';
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

import { Bone } from '@/components/dashboard/Bone';
import {
  DASH_DISPLAY,
  DASH_FOCUS,
  DASH_HEADING,
  DASH_INK_TEXT,
  DASH_LINK,
  DASH_SUB_TEXT,
  DASH_TINT,
  DASH_TINT_HOVER,
} from '@/components/dashboard/dashboardStyles';

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
 * Ein Eintrag der aufgeklappten Liste — eine kleinere Ausgabe der Kachel
 * darüber: getönte Fläche, Name und Zeile unten, Aktion oben rechts.
 */
const ShelfItem = memo(function ShelfItem({ entry }: { entry: ShelfEntry }) {
  const prefetch = useNotebookPrefetch();
  const { title, meta, to, prefetchSlug, action } = describeEntry(entry);
  const warm = () => (prefetchSlug ? prefetch(prefetchSlug) : prefetch());
  return (
    <li className="relative flex">
      <Link
        to={to}
        state={OPEN_STATE}
        onPointerEnter={warm}
        className={cn(
          'flex min-h-[84px] min-w-0 flex-1 flex-col justify-end gap-0.5 rounded-2xl px-4 py-3.5 pr-10 no-underline transition-colors',
          'md:min-h-[96px] md:gap-[3px] md:px-[18px] md:py-4 md:pr-11 lg:min-h-[108px] lg:gap-1 lg:p-5 lg:pr-12',
          DASH_TINT,
          DASH_TINT_HOVER,
          DASH_FOCUS
        )}
      >
        <span
          className={cn(
            'break-words text-[15px] font-bold leading-[1.2] hyphens-auto md:text-base lg:text-[17px]',
            DASH_DISPLAY,
            DASH_INK_TEXT
          )}
        >
          {title}
        </span>
        <span className={cn('text-[13px]', DASH_SUB_TEXT)}>{meta}</span>
      </Link>
      {action && <div className="absolute right-1.5 top-1.5">{action}</div>}
    </li>
  );
});

// Fotoreihe wie im Marktplatz: Kachelbreite = (Reihe − Abstände) ÷ eine
// .5-Anzahl, damit die nächste Karte halb sichtbar bleibt und das Scrollen zeigt.
const PHOTO_ROW = 'm-0 flex list-none gap-3 overflow-x-auto p-0 pt-1 pb-3 sm:gap-4';
const PHOTO_ITEM =
  'min-w-0 shrink-0 basis-[calc((100%_-_1.5rem)_*_0.4)] sm:basis-[calc((100%_-_3rem)_*_0.2857)] md:basis-[calc((100%_-_4rem)_*_0.2222)] lg:basis-[calc((100%_-_5rem)_*_0.1818)]';

/**
 * Ein Landesverband als Fotokarte — dasselbe Foto wie im Marktplatz. Ohne Foto
 * (z. B. der Bundesverband) bleibt es die Textkarte.
 */
const PhotoShelfItem = memo(function PhotoShelfItem({ entry }: { entry: ShelfEntry }) {
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
});

/** Kachel-Inhalt: Chevron (nur aufklappbare) oben rechts, Name und Zeile unten. `expanded: null` = klappt nichts auf. */
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
              'text-(--dash-mg)',
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
            DASH_DISPLAY,
            DASH_INK_TEXT
          )}
        >
          {shelf.title}
        </span>
        {shelf.meta === null ? (
          <Bone className="h-3.5 w-24 bg-(--dash-mg-tint-2)" />
        ) : (
          <span className={cn('text-[13px] lg:text-sm', DASH_SUB_TEXT)}>{shelf.meta}</span>
        )}
      </span>
    </>
  );
}

const tileClass = (open: boolean) =>
  cn(
    SHELF_TILE,
    DASH_TINT,
    DASH_TINT_HOVER,
    'cursor-pointer border-0 transition-colors',
    open && 'shadow-[inset_0_0_0_2px_var(--dash-mg)]',
    DASH_FOCUS
  );

/**
 * Eine Kachel. `memo` mit stabilem `onToggle`: beim Auf- und Zuklappen rendern
 * nur die alte und die neue offene Kachel, nicht alle.
 */
const ShelfTile = memo(function ShelfTile({
  shelf,
  isOpen,
  panelId,
  onToggle,
}: {
  shelf: Shelf;
  isOpen: boolean;
  panelId: string;
  onToggle: (id: string) => void;
}) {
  const prefetch = useNotebookPrefetch();
  if (shelf.kind === 'group') {
    return (
      <button
        type="button"
        aria-expanded={isOpen}
        {...(isOpen ? { 'aria-controls': panelId } : {})}
        onClick={() => onToggle(shelf.id)}
        className={tileClass(isOpen)}
      >
        <TileBody shelf={shelf} expanded={isOpen} />
      </button>
    );
  }
  const to = shelf.kind === 'notebook' ? shelf.notebook.path : CREATE_PATH;
  return (
    <Link
      to={to}
      state={shelf.kind === 'notebook' ? OPEN_STATE : null}
      onPointerEnter={() => shelf.kind === 'notebook' && prefetch()}
      className={tileClass(false)}
    >
      <TileBody shelf={shelf} expanded={null} />
    </Link>
  );
});

type GroupShelf = Extract<Shelf, { kind: 'group' }>;

/** Die aufgeklappte Liste einer Gruppe. `memo`: rendert nur, wenn eine andere Gruppe aufgeht. */
const ShelfPanel = memo(function ShelfPanel({ shelf, id }: { shelf: GroupShelf; id: string }) {
  return (
    <div id={id} className="flex flex-col gap-3">
      <h3 className={cn('m-0 text-lg max-lg:sr-only', DASH_HEADING)}>{shelf.title}</h3>
      {shelf.layout === 'photos' ? (
        <ul className={PHOTO_ROW}>
          {shelf.entries.map((entry) => (
            <PhotoShelfItem key={entry.key} entry={entry} />
          ))}
        </ul>
      ) : (
        <ConfirmDialogProvider>
          <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 md:grid-cols-3 md:gap-3 lg:grid-cols-4 lg:gap-3.5">
            {shelf.entries.map((entry) => (
              <ShelfItem key={entry.key} entry={entry} />
            ))}
          </ul>
        </ConfirmDialogProvider>
      )}
    </div>
  );
});

/**
 * Kacheln und aufgeklappte Liste mit dem Klappzustand. Er liegt hier statt in
 * `NotebookShelf`, damit Überschrift, „Neues erstellen" und Hinweis beim
 * Auf- und Zuklappen nicht mitrendern.
 */
function ShelfBrowser({
  shelves,
  gridClassName = SHELF_GRID,
}: {
  shelves: Shelf[];
  gridClassName?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = useCallback((id: string) => setOpenId((cur) => (cur === id ? null : id)), []);
  const panelId = useId();
  const open = shelves.find((s): s is GroupShelf => s.id === openId && s.kind === 'group') ?? null;
  return (
    <>
      <div className={gridClassName}>
        {shelves.map((shelf) => (
          <ShelfTile
            key={shelf.id}
            shelf={shelf}
            isOpen={open?.id === shelf.id}
            panelId={panelId}
            onToggle={toggle}
          />
        ))}
      </div>

      {open && <ShelfPanel shelf={open} id={panelId} />}
    </>
  );
}

/**
 * „Deine Notebooks": Kacheln für die Notebook-Gruppen. Eine Gruppe klappt
 * darunter ihre Liste auf (immer nur eine; die Landesverbände als Fotoreihe),
 * ein einzelnes Notebook öffnet direkt.
 */
export function NotebookShelf() {
  return (
    <ShelfSection
      header={
        <>
          <h2 className={cn('m-0 text-[19px] md:text-[22px] lg:text-2xl', DASH_HEADING)}>
            Deine Notebooks
          </h2>
          <Link to={CREATE_PATH} className={cn('py-3 text-[15px] lg:py-0', DASH_LINK)}>
            Neues erstellen
          </Link>
        </>
      }
    >
      <NotebookShelfBrowser />
    </ShelfSection>
  );
}

/**
 * Kacheln, aufgeklappte Liste und Ausfall-Hinweis ohne Kopfzeile — für Seiten,
 * die den Block unter ihrer eigenen Überschrift zeigen (Arbeiten-Tab).
 */
export function NotebookShelfBrowser({ gridClassName }: { gridClassName?: string }) {
  const { shelves, vectorStoreDown } = useNotebookShelves();
  return (
    <>
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
      <ShelfBrowser shelves={shelves} gridClassName={gridClassName} />
    </>
  );
}
