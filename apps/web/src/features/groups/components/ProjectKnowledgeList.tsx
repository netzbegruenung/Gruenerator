import { filterGroupFeed, groupFeedKindMeta, type GroupFeedItem } from '@gruenerator/shared/groups';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { type ReactNode, useState } from 'react';
import { PiChatsCircle, PiDotsThreeVertical, PiMagnifyingGlass, PiTrash } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { FEED_KIND_ICONS, feedItemHref } from '../config/groupFeedPresentation';

/** Ab so vielen Zeilen lohnt sich ein Suchfeld. */
const SEARCH_FROM = 6;

interface ProjectKnowledgeListProps {
  items: GroupFeedItem[];
  onUseTemplate: (id: string) => void;
  /** null: the viewer may not remove things from this project. */
  onRemove: ((item: GroupFeedItem) => void) | null;
  /** null: no Austausch here (personal project, system project). */
  onDiscuss: ((item: GroupFeedItem) => void) | null;
}

const rowCls =
  'flex min-w-0 flex-1 items-center gap-sm rounded-md px-sm py-2 text-left text-foreground no-underline';

/**
 * „Wissen": was Chats im Projekt nutzen können — Dateien, Texte, Notebooks,
 * Rezepte, Agents … — als eine kompakte Liste statt großer Karten. Ein Klick
 * öffnet das bestehende Ziel; Entfernen und „Im Austausch besprechen" hängen am
 * Zeilenmenü.
 */
export function ProjectKnowledgeList({
  items,
  onUseTemplate,
  onRemove,
  onDiscuss,
}: ProjectKnowledgeListProps) {
  const [query, setQuery] = useState('');
  const visible = filterGroupFeed(items, query);

  return (
    <section
      aria-labelledby="projekt-wissen-titel"
      className="flex flex-col gap-xs rounded-[20px] bg-card p-md shadow-sm"
    >
      <div className="flex items-baseline justify-between">
        <h2 id="projekt-wissen-titel" className="m-0 text-[17px] font-semibold">
          Wissen
        </h2>
        {items.length > 0 && <span className="text-sm text-muted-foreground">{items.length}</span>}
      </div>

      {items.length === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">
          Noch nichts hinterlegt. Mit „Hinzufügen“ legst du Dateien, Texte oder Notebooks ab, die
          Chats in diesem Projekt nutzen.
        </p>
      ) : (
        <>
          {items.length > SEARCH_FROM && (
            <label className="mb-xs flex h-9 items-center gap-xs rounded-full border border-grey-200 bg-background px-3 text-muted-foreground focus-within:border-primary-500 dark:border-grey-700">
              <PiMagnifyingGlass aria-hidden className="size-4 shrink-0" />
              <span className="sr-only">Im Wissen suchen</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Im Wissen suchen"
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
                  onRemove={onRemove}
                  onDiscuss={onDiscuss}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function KnowledgeRow({
  item,
  onUseTemplate,
  onRemove,
  onDiscuss,
}: {
  item: GroupFeedItem;
  onUseTemplate: (id: string) => void;
  onRemove: ProjectKnowledgeListProps['onRemove'];
  onDiscuss: ProjectKnowledgeListProps['onDiscuss'];
}) {
  const Icon = FEED_KIND_ICONS[item.kind];
  const content: ReactNode = (
    <>
      <Icon aria-hidden className="size-[18px] shrink-0 text-primary-600 dark:text-primary-400" />
      <span className="min-w-0 flex-1 truncate text-[15px]">{item.title}</span>
      <span className="shrink-0 text-[13px] text-muted-foreground">
        {groupFeedKindMeta(item.kind).label}
      </span>
    </>
  );
  const href = feedItemHref(item);
  const hasMenu = !!onRemove || (!!onDiscuss && !!item.share);

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
            {onDiscuss && item.share && (
              <DropdownMenuItem onSelect={() => onDiscuss(item)}>
                <PiChatsCircle aria-hidden className="mr-xs size-4" />
                Im Austausch besprechen
              </DropdownMenuItem>
            )}
            {onRemove && (
              <DropdownMenuItem
                onSelect={() => onRemove(item)}
                className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
              >
                <PiTrash aria-hidden className="mr-xs size-4" />
                Aus dem Projekt entfernen
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
