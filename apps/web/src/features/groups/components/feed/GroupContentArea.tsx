import {
  filterGroupFeed,
  isPinned,
  type GroupFeedItem,
  type GroupMember,
} from '@gruenerator/shared/groups';
import { cn, LoadingSection, Tabs, TabsContent, TabsList, TabsTrigger } from '@gruenerator/ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { PiMagnifyingGlass } from 'react-icons/pi';
import { useSearchParams } from 'react-router-dom';

import { GroupComposer } from './GroupComposer';
import { GroupFeedCard } from './GroupFeedCard';
import { GroupMentionProvider } from './GroupMentions';

type View = 'uebersicht' | 'austausch';

interface GroupContentAreaProps {
  groupId: string;
  groupName: string;
  items: GroupFeedItem[];
  isLoading: boolean;
  isAdmin: boolean;
  isPersonal: boolean;
  isSystem: boolean;
  currentUserId: string | null;
  currentUserName: string | null;
  members: GroupMember[];
  /**
   * Teilen-Dialog; `note` kommt aus dem Composer („Aus meinen Inhalten").
   * null: the viewer may not share here (system group, non-admin).
   */
  onOpenShare: ((note?: string) => void) | null;
  onRemove: ((item: GroupFeedItem) => void) | null;
  onUseTemplate: (id: string) => void;
  cloningId: string | null;
  /**
   * Chats, Wissen, Mitglieder — die Seite, die man zuerst sieht. `onDiscuss`
   * holt ein Wissen-Element in den Austausch (null: es gibt keinen Austausch).
   */
  overview: (ctx: { onDiscuss: ((item: GroupFeedItem) => void) | null }) => ReactNode;
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
  isPersonal,
  isSystem,
  currentUserId,
  currentUserName,
  members,
  onOpenShare,
  onRemove,
  onUseTemplate,
  cloningId,
  overview,
}: GroupContentAreaProps) {
  const [searchParams] = useSearchParams();
  const linkedShareId = searchParams.get('beitrag');
  const hasAustausch = !isPersonal;
  // Die System-Gruppe lebt von den Beiträgen der Admins; sonst ist die Übersicht der Einstieg.
  const [view, setView] = useState<View>(
    hasAustausch && (linkedShareId || isSystem) ? 'austausch' : 'uebersicht'
  );
  const [focusShareId, setFocusShareId] = useState<string | null>(linkedShareId);
  // Wissen-Elemente, die jemand aus der Liste in den Austausch geholt hat.
  const [discussed, setDiscussed] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');

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

  // Der Austausch zeigt, was besprochen wird: Beiträge und Freigaben mit Notiz,
  // Anheftung, Reaktionen oder Kommentaren — plus, was gerade angesteuert wird.
  // Alles andere ist Wissen und steht in der Liste der Übersicht.
  const austauschItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.kind === 'post' ||
          isPinned(i) ||
          !!i.share?.note ||
          (i.share?.commentCount ?? 0) > 0 ||
          (i.share?.reactions.length ?? 0) > 0 ||
          (!!i.share && (discussed.has(i.share.shareId) || i.share.shareId === focusShareId))
      ),
    [items, discussed, focusShareId]
  );
  const visible = filterGroupFeed(austauschItems, query);
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

  if (!hasAustausch) {
    return isLoading ? (
      <LoadingSection label="Inhalte werden geladen …" />
    ) : (
      overview({ onDiscuss })
    );
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
        ? 'Noch nichts im Austausch. Schreib etwas an die Gruppe oder teile einen Inhalt mit einer Notiz.'
        : 'Noch keine Beiträge.'}
    </p>
  );

  return (
    <GroupMentionProvider value={mentionOptions}>
      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="gap-lg">
        <TabsList variant="line" className="h-auto w-fit gap-xs" aria-label="Ansicht">
          <TabsTrigger value="uebersicht" className={pillCls}>
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="austausch" className={pillCls}>
            Austausch
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <LoadingSection label="Inhalte werden geladen …" />
        ) : (
          <>
            <TabsContent value="uebersicht" className="mt-0">
              {overview({ onDiscuss })}
            </TabsContent>
            <TabsContent value="austausch" className="mt-0">
              <div className="mx-auto flex max-w-[760px] flex-col gap-lg">
                <label className="flex h-[38px] w-full items-center gap-xs rounded-full border border-grey-200 bg-card px-3.5 text-muted-foreground focus-within:border-primary-500 dark:border-grey-700">
                  <PiMagnifyingGlass aria-hidden className="size-4 shrink-0" />
                  <span className="sr-only">Im Austausch suchen</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Im Austausch suchen"
                    className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
                  />
                </label>
                {!hasQuery && onOpenShare && (
                  <GroupComposer
                    groupId={groupId}
                    groupName={groupName}
                    memberCount={isSystem ? null : members.length}
                    currentUserName={currentUserName}
                    onOpenShare={onOpenShare}
                  />
                )}
                {visible.length === 0
                  ? empty
                  : visible.map((item) => (
                      <GroupFeedCard
                        key={item.key}
                        item={item}
                        groupId={groupId}
                        isAdmin={isAdmin}
                        canComment
                        currentUserId={currentUserId}
                        currentUserName={currentUserName}
                        defaultOpen={!!focusShareId && item.share?.shareId === focusShareId}
                        onUseTemplate={onUseTemplate}
                        isCloning={cloningId === item.id}
                        onRemove={onRemove}
                      />
                    ))}
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>
    </GroupMentionProvider>
  );
}
