import {
  PROJECT_SEARCH_STATE_LABELS,
  filterGroupFeed,
  groupFeedKindMeta,
  searchSummary,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { type ReactNode, useState } from 'react';
import {
  PiChatsCircle,
  PiDotsThreeVertical,
  PiMagnifyingGlass,
  PiPencilSimple,
  PiX,
} from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { FEED_KIND_ICONS, feedItemHref } from '../config/groupFeedPresentation';

import { type ShareActions, ShareMenuItems, hasShareMenu, projectRoleLabel } from './shareActions';

/** So viele Zeilen stehen eingeklappt da; der Rest klappt auf Wunsch auf. */
const KNOWLEDGE_SHOWN = 6;

interface ProjectKnowledgeListProps {
  items: GroupFeedItem[];
  onUseTemplate: (id: string) => void;
  /** Rolle ändern und entfernen; null: der Viewer verwaltet hier nichts. */
  actions: ShareActions | null;
  /** null: no Austausch here (nobody else in the project). */
  onDiscuss: ((item: GroupFeedItem) => void) | null;
}

const rowCls =
  'flex min-w-0 flex-1 items-center gap-sm rounded-md px-sm py-2 text-left text-foreground no-underline';

/**
 * „Wissen": was Chats im Projekt nutzen können — Dateien, Texte, Notebooks,
 * Agents … — als eine kompakte Liste statt großer Karten. Rezepte stehen in
 * ihrer eigenen Karte (`ProjectRecipesCard`). Ein Klick
 * öffnet das bestehende Ziel; Entfernen und „Im Austausch besprechen" hängen am
 * Zeilenmenü.
 */
export function ProjectKnowledgeList({
  items,
  onUseTemplate,
  actions,
  onDiscuss,
}: ProjectKnowledgeListProps) {
  const [query, setQuery] = useState('');
  // Suche über die Lupe im Kopf, nicht als stehendes Feld.
  const [searchOpen, setSearchOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const searching = searchOpen && query.trim().length > 0;
  const matches = filterGroupFeed(items, query);
  // Beim Suchen zählt jeder Treffer; sonst nur die ersten Zeilen, bis jemand aufklappt.
  const visible = searching || showAll ? matches : matches.slice(0, KNOWLEDGE_SHOWN);
  const { searchable, total } = searchSummary(items);

  return (
    <section
      aria-labelledby="projekt-wissen-titel"
      className="flex flex-col gap-xs rounded-[20px] bg-card p-md shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h2 id="projekt-wissen-titel" className="m-0 text-[17px] font-semibold">
          Wissen
        </h2>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-1 rounded-full"
            aria-label={searchOpen ? 'Suche im Wissen schließen' : 'Im Wissen suchen'}
            aria-expanded={searchOpen}
            title={searchOpen ? 'Suche schließen' : 'Im Wissen suchen'}
            onClick={() => {
              if (searchOpen) setQuery('');
              setSearchOpen((v) => !v);
            }}
          >
            {searchOpen ? <PiX aria-hidden /> : <PiMagnifyingGlass aria-hidden />}
          </Button>
        )}
      </div>

      {total > 0 && (
        <p className="m-0 text-[13px] text-muted-foreground">
          {searchable} von {total} durchsuchbar
        </p>
      )}

      {items.length === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">
          Noch nichts hinterlegt. Mit „Hinzufügen“ legst du Dateien, Texte oder Notebooks ab, die
          Chats in diesem Projekt nutzen.
        </p>
      ) : (
        <>
          {searchOpen && (
            <label className="mb-xs flex h-9 items-center gap-xs rounded-full border border-grey-200 bg-background px-3 text-muted-foreground focus-within:border-primary-500 dark:border-grey-700">
              <PiMagnifyingGlass aria-hidden className="size-4 shrink-0" />
              <span className="sr-only">Im Wissen suchen</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Im Wissen suchen"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- opened on purpose via the magnifier
                autoFocus
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
              />
            </label>
          )}
          {visible.length === 0 ? (
            <p className="m-0 text-[15px] text-muted-foreground">
              Nichts gefunden für „{query.trim()}“.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {visible.map((item) => (
                <KnowledgeRow
                  key={item.key}
                  item={item}
                  onUseTemplate={onUseTemplate}
                  actions={actions}
                  onDiscuss={onDiscuss}
                />
              ))}
            </ul>
          )}
          {!searching && matches.length > KNOWLEDGE_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="self-start cursor-pointer rounded-md border-none bg-transparent px-sm py-1 font-[inherit] text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {showAll ? 'Weniger anzeigen' : `Alle ${matches.length} anzeigen`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Eine Zeile: öffnet das Ziel, Entfernen und Besprechen hängen am Menü. Auch die Rezepte-Karte nutzt sie. */
export function KnowledgeRow({
  item,
  onUseTemplate,
  actions,
  onDiscuss,
  onEdit = null,
  hideKind = false,
}: {
  item: GroupFeedItem;
  onUseTemplate: (id: string) => void;
  actions: ShareActions | null;
  onDiscuss: ProjectKnowledgeListProps['onDiscuss'];
  /** „Bearbeiten" im Menü — nur wo die Person den Inhalt selbst ändern darf. */
  onEdit?: (() => void) | null;
  /** In einer Karte, die nur eine Art zeigt (Rezepte), ist die Art kein Hinweis. */
  hideKind?: boolean;
}) {
  const Icon = FEED_KIND_ICONS[item.kind];
  const content: ReactNode = (
    <>
      <Icon aria-hidden className="size-[18px] shrink-0 text-primary-600 dark:text-primary-400" />
      <span className="min-w-0 flex-1 truncate text-[15px]">{item.title}</span>
      {item.searchState && item.searchState !== 'ready' && (
        <span className="flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground">
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full ${
              item.searchState === 'failed' ? 'bg-red-600' : 'bg-amber-500'
            }`}
          />
          {PROJECT_SEARCH_STATE_LABELS[item.searchState]}
        </span>
      )}
      <span className="shrink-0 text-[13px] text-muted-foreground">
        {[hideKind ? null : groupFeedKindMeta(item.kind).label, projectRoleLabel(item)]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </>
  );
  const href = feedItemHref(item);
  const canDiscuss = !!onDiscuss && !!item.share;
  const hasMenu = !!onEdit || canDiscuss || hasShareMenu(item, actions);

  return (
    <li className="flex items-center rounded-md transition-colors hover:bg-background-alt">
      {item.kind === 'sharepic-template' ? (
        <button
          type="button"
          onClick={() => onUseTemplate(item.id)}
          className={`${rowCls} cursor-pointer border-none bg-transparent font-[inherit]`}
        >
          {content}
        </button>
      ) : href ? (
        <Link to={href} className={rowCls}>
          {content}
        </Link>
      ) : (
        <div className={rowCls}>{content}</div>
      )}
      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 rounded-full"
              aria-label={`Weitere Aktionen für ${item.title}`}
            >
              <PiDotsThreeVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onSelect={onEdit}>
                <PiPencilSimple aria-hidden className="mr-xs size-4" />
                Bearbeiten
              </DropdownMenuItem>
            )}
            {canDiscuss && onDiscuss && (
              <DropdownMenuItem onSelect={() => onDiscuss(item)}>
                <PiChatsCircle aria-hidden className="mr-xs size-4" />
                Im Austausch besprechen
              </DropdownMenuItem>
            )}
            {actions && (
              <ShareMenuItems
                item={item}
                actions={actions}
                leadingSeparator={canDiscuss || !!onEdit}
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
