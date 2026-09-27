import { filterGroupFeed, type GroupFeedItem, type GroupMember } from '@gruenerator/shared/groups';
import {
  Button,
  cn,
  LoadingSection,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gruenerator/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { PiMagnifyingGlass, PiPlus, PiUsers } from 'react-icons/pi';
import { useSearchParams } from 'react-router-dom';

import { GroupAllView } from './GroupAllView';
import { GroupComposer } from './GroupComposer';
import { GroupFeedCard } from './GroupFeedCard';
import { GroupSidebar } from './GroupSidebar';

type View = 'feed' | 'all';

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
  description: string | null;
  linkCount: number;
  onShowMembers: () => void;
  /**
   * Teilen-Dialog; `note` kommt aus dem Composer („Aus meinen Inhalten").
   * null: the viewer may not share here (system group, non-admin).
   */
  onOpenShare: ((note?: string) => void) | null;
  onRemove: ((item: GroupFeedItem) => void) | null;
  onUseTemplate: (id: string) => void;
  cloningId: string | null;
  /** Links und Chats — unten in „Alle". */
  extraAllSections: ReactNode;
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
  description,
  linkCount,
  onShowMembers,
  onOpenShare,
  onRemove,
  onUseTemplate,
  cloningId,
  extraAllSections,
}: GroupContentAreaProps) {
  const [searchParams] = useSearchParams();
  const focusShareId = searchParams.get('beitrag');
  const [view, setView] = useState<View>(isPersonal ? 'all' : 'feed');
  const [query, setQuery] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);

  const visible = filterGroupFeed(items, query);
  const hasQuery = query.trim().length > 0;

  // Aus einer Benachrichtigung (`?beitrag=<shareId>`): zum Beitrag scrollen.
  useEffect(() => {
    if (!focusShareId || isLoading) return;
    document.getElementById(`beitrag-${focusShareId}`)?.scrollIntoView({ block: 'start' });
  }, [focusShareId, isLoading]);

  const sidebar = !isPersonal && (
    <GroupSidebar
      description={description}
      isPersonal={isPersonal}
      members={members}
      items={items}
      linkCount={linkCount}
      onShowMembers={onShowMembers}
      onJumpToSection={(anchor) => {
        setQuery('');
        setView('all');
        // „Alle" ist erst nach dem Commit gemountet.
        requestAnimationFrame(() =>
          document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        );
      }}
    />
  );

  const empty = hasQuery ? (
    <div className="flex flex-col items-center gap-1.5 py-2xl text-center">
      <h2 className="m-0 text-xl font-semibold">Nichts gefunden</h2>
      <p className="m-0 text-[15px] text-muted-foreground">
        Kein Inhalt passt zu „{query.trim()}“.
      </p>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-sm py-2xl text-center">
      <p className="m-0 text-[15px] text-muted-foreground">
        {isPersonal ? 'In diesem Projekt liegt noch nichts.' : 'Noch nichts geteilt.'}
      </p>
      {onOpenShare && (
        <Button variant="brand-outline" onClick={() => onOpenShare()}>
          <PiPlus aria-hidden /> Ersten Inhalt teilen
        </Button>
      )}
    </div>
  );

  return (
    <Tabs value={view} onValueChange={(v) => setView(v as View)} className="gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex flex-wrap items-center gap-xs">
          {!isPersonal && (
            <TabsList variant="line" className="h-auto gap-xs" aria-label="Ansicht">
              <TabsTrigger value="feed" className={pillCls}>
                Feed
              </TabsTrigger>
              <TabsTrigger value="all" className={pillCls}>
                Alle
                <span className="text-[13px] opacity-80">{items.length}</span>
              </TabsTrigger>
            </TabsList>
          )}
          {!isPersonal && view === 'feed' && (
            <Button
              variant="outline"
              className={cn(
                'h-[38px] rounded-full min-[900px]:hidden',
                infoOpen && 'border-primary-300 bg-primary-50 dark:bg-primary-900/30'
              )}
              aria-expanded={infoOpen}
              aria-controls="gruppen-info"
              onClick={() => setInfoOpen((o) => !o)}
            >
              <PiUsers aria-hidden /> Info
            </Button>
          )}
        </div>
        <label className="flex h-[38px] w-[260px] max-w-full items-center gap-xs rounded-full border border-grey-200 bg-card px-3.5 text-muted-foreground focus-within:border-primary-500 dark:border-grey-700">
          <PiMagnifyingGlass aria-hidden className="size-4 shrink-0" />
          <span className="sr-only">
            {isPersonal ? 'Im Projekt suchen' : 'In der Gruppe suchen'}
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isPersonal ? 'Im Projekt suchen' : 'In der Gruppe suchen'}
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
          />
        </label>
      </div>

      {isLoading ? (
        <LoadingSection label="Inhalte werden geladen …" />
      ) : (
        <>
          {!isPersonal && (
            <TabsContent value="feed" className="mt-0">
              <div className="flex flex-col gap-lg min-[900px]:flex-row min-[900px]:items-start min-[900px]:gap-xl">
                <div className="flex min-w-0 flex-1 flex-col gap-lg">
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
                <div
                  id="gruppen-info"
                  className={cn(
                    '-order-1 min-[900px]:sticky min-[900px]:top-lg min-[900px]:order-none min-[900px]:block min-[900px]:w-[300px] min-[900px]:shrink-0',
                    !infoOpen && 'hidden'
                  )}
                >
                  {sidebar}
                </div>
              </div>
            </TabsContent>
          )}
          <TabsContent value="all" className="mt-0">
            {visible.length === 0 && (hasQuery || linkCount === 0) && empty}
            <GroupAllView
              items={visible}
              groupId={groupId}
              isAdmin={isAdmin}
              showPinned={!hasQuery}
              onUseTemplate={onUseTemplate}
            >
              {!hasQuery && extraAllSections}
            </GroupAllView>
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
