import {
  austauschItems,
  filterGroupFeed,
  type GroupFeedItem,
  type GroupMember,
} from '@gruenerator/shared/groups';
import { cn, LoadingSection, Tabs, TabsContent, TabsList, TabsTrigger } from '@gruenerator/ui';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { PiMagnifyingGlass, PiX } from 'react-icons/pi';
import { useSearchParams } from 'react-router-dom';

import { type ShareActions } from '../shareActions';

import { GroupComposer } from './GroupComposer';
import { GroupFeedRow } from './GroupFeedRow';
import { GroupMentionProvider } from './GroupMentions';

type View = 'uebersicht' | 'austausch';

interface GroupContentAreaProps {
  groupId: string;
  groupName: string;
  items: GroupFeedItem[];
  isLoading: boolean;
  isAdmin: boolean;
  /** Austausch (Beiträge, Kommentare) only once somebody else is in the Projekt, or in the system Projekt. */
  hasAustausch: boolean;
  isSystem: boolean;
  currentUserId: string | null;
  currentUserName: string | null;
  members: GroupMember[];
  /**
   * Teilen-Dialog; `note` kommt aus dem Composer („Aus meinen Inhalten").
   * null: the viewer may not share here (system group, non-admin).
   */
  onOpenShare: ((note?: string) => void) | null;
  /** Rolle ändern und entfernen; null: der Viewer verwaltet hier nichts. */
  actions: ShareActions | null;
  onUseTemplate: (id: string) => void;
  cloningId: string | null;
  /** Linke Spalte der Übersicht (Chats); null: die rechte Spalte nimmt die ganze Breite. */
  overviewMain: ReactNode | null;
  /**
   * Rechte Spalte (Anweisungen, Wissen, Mitglieder): steht in beiden Reitern an
   * derselben Stelle, damit beim Wechsel nur die linke Spalte springt. `onDiscuss`
   * holt ein Wissen-Element in den Austausch (null: es gibt keinen Austausch).
   */
  sidebar: (ctx: { onDiscuss: ((item: GroupFeedItem) => void) | null }) => ReactNode;
  /**
   * Zählt hoch, wenn jemand „Im Austausch suchen" im Projektmenü wählt: dann
   * wechselt der Reiter, und das Suchfeld erscheint mit Fokus. 0 = nie gewählt.
   */
  searchSignal?: number;
}

const pillCls = cn(
  'h-[38px] flex-none rounded-full border-grey-200 bg-card px-md text-[15px] after:hidden dark:border-grey-700',
  'data-[state=active]:border-primary-600! data-[state=active]:bg-primary-600! data-[state=active]:text-white!'
);

export function GroupContentArea({
  groupId,
  groupName,
  items,
  isLoading,
  isAdmin,
  hasAustausch,
  isSystem,
  currentUserId,
  currentUserName,
  members,
  onOpenShare,
  actions,
  onUseTemplate,
  cloningId,
  overviewMain,
  sidebar,
  searchSignal = 0,
}: GroupContentAreaProps) {
  const [searchParams] = useSearchParams();
  const linkedShareId = searchParams.get('beitrag');
  // Die System-Gruppe lebt von den Beiträgen der Admins; sonst ist die Übersicht der Einstieg.
  // Der Reiter kann erst später erscheinen (Beiträge laden nach): bis jemand wählt, entscheidet der Stand.
  const [chosenView, setView] = useState<View | null>(null);
  const view: View =
    chosenView ?? (hasAustausch && (linkedShareId || isSystem) ? 'austausch' : 'uebersicht');
  const [focusShareId, setFocusShareId] = useState<string | null>(linkedShareId);
  // Wissen-Elemente, die jemand aus der Liste in den Austausch geholt hat.
  const [discussed, setDiscussed] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  // Das Suchfeld steht nur da, wenn jemand suchen will (Projektmenü), nicht immer.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchSignal === 0) return;
    setView('austausch');
    setSearchOpen(true);
  }, [searchSignal]);
  useEffect(() => {
    if (searchOpen && view === 'austausch') searchInputRef.current?.focus();
  }, [searchOpen, searchSignal, view]);
  const closeSearch = () => {
    setQuery('');
    setSearchOpen(false);
  };

  const mentionOptions = useMemo(
    () => ({
      candidates: members
        .filter((m) => m.user_id !== currentUserId)
        .map((m) => ({ userId: m.user_id, label: m.display_name || m.first_name || '' }))
        .filter((c) => c.label),
      // In der System-Gruppe erreicht @alle alle Nutzer*innen: nur wer dort schreiben darf.
      allowAll: !isSystem || !!onOpenShare,
      memberCount: isSystem ? null : members.length,
    }),
    [members, currentUserId, isSystem, onOpenShare]
  );

  // Was in den Austausch gehört, entscheidet `austauschItems`; alles andere
  // ist Wissen und steht in der Liste der Übersicht.
  const austausch = useMemo(
    () => austauschItems(items, discussed, focusShareId),
    [items, discussed, focusShareId]
  );
  const visible = filterGroupFeed(austausch, query);
  const hasQuery = query.trim().length > 0;

  // Aus einer Benachrichtigung (`?beitrag=<shareId>`) oder „Im Austausch besprechen": hinscrollen.
  useEffect(() => {
    if (!focusShareId || isLoading || view !== 'austausch') return;
    document.getElementById(`beitrag-${focusShareId}`)?.scrollIntoView({ block: 'start' });
  }, [focusShareId, isLoading, view]);

  const onDiscuss = hasAustausch
    ? (item: GroupFeedItem) => {
        const shareId = item.share?.shareId;
        if (!shareId) return;
        setDiscussed((prev) => new Set(prev).add(shareId));
        setFocusShareId(shareId);
        setQuery('');
        setView('austausch');
      }
    : null;

  const columns = (main: ReactNode | null) => (
    <div className="flex flex-col gap-lg min-[900px]:flex-row min-[900px]:items-start min-[900px]:gap-xl">
      {main !== null && <div className="flex min-w-0 flex-1 flex-col gap-md">{main}</div>}
      <div
        className={cn(
          'flex min-w-0 flex-col gap-md',
          main !== null ? 'min-[900px]:w-[340px] min-[900px]:shrink-0' : 'flex-1'
        )}
      >
        {sidebar({ onDiscuss })}
      </div>
    </div>
  );

  if (!hasAustausch) {
    return isLoading ? <LoadingSection label="Inhalte werden geladen …" /> : columns(overviewMain);
  }

  const empty = hasQuery ? (
    <div className="flex flex-col items-center gap-1.5 py-2xl text-center">
      <h2 className="m-0 text-xl font-semibold">Nichts gefunden</h2>
      <p className="m-0 text-[15px] text-muted-foreground">
        Kein Beitrag passt zu „{query.trim()}“.
      </p>
    </div>
  ) : (
    <p className="m-0 py-xl text-center text-[15px] text-muted-foreground">
      {onOpenShare
        ? 'Noch nichts im Austausch. Schreib etwas an das Projekt oder teile einen Inhalt mit einer Notiz.'
        : 'Noch keine Beiträge.'}
    </p>
  );

  const austauschMain = (
    <div className="flex flex-col gap-lg">
      {(searchOpen || hasQuery) && (
        <div className="flex h-[38px] w-full items-center gap-xs rounded-full border border-grey-200 bg-card pl-3.5 pr-1 text-muted-foreground focus-within:border-primary-500 dark:border-grey-700">
          <PiMagnifyingGlass aria-hidden className="size-4 shrink-0" />
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Im Austausch suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeSearch();
            }}
            placeholder="Im Austausch suchen"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
          />
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Suche schließen"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PiX aria-hidden className="size-4" />
          </button>
        </div>
      )}
      {!hasQuery && onOpenShare && (
        <GroupComposer
          groupId={groupId}
          groupName={groupName}
          memberCount={isSystem ? null : members.length}
          currentUserName={currentUserName}
          onOpenShare={onOpenShare}
        />
      )}
      {visible.length === 0 ? (
        empty
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {visible.map((item) => (
            <GroupFeedRow
              key={item.key}
              item={item}
              groupId={groupId}
              isAdmin={isAdmin}
              canComment
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              // Ausgeklappt ist der Normalfall: man soll die Beiträge lesen, ohne zu klicken.
              defaultOpen
              onUseTemplate={onUseTemplate}
              isCloning={cloningId === item.id}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <GroupMentionProvider value={mentionOptions}>
      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="gap-lg">
        <TabsList variant="line" className="h-auto w-fit gap-xs" aria-label="Ansicht">
          {/* Interner Schlüssel bleibt `uebersicht`; links stehen nur noch die Chats. */}
          <TabsTrigger value="uebersicht" className={pillCls}>
            Chat
          </TabsTrigger>
          <TabsTrigger value="austausch" className={pillCls}>
            Austausch
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <LoadingSection label="Inhalte werden geladen …" />
        ) : (
          <>
            {view === 'uebersicht' ? (
              <TabsContent value="uebersicht" className="mt-0">
                {columns(overviewMain)}
              </TabsContent>
            ) : (
              <TabsContent value="austausch" className="mt-0">
                {columns(austauschMain)}
              </TabsContent>
            )}
          </>
        )}
      </Tabs>
    </GroupMentionProvider>
  );
}
