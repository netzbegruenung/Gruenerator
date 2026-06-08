import { type ActivityType, type BoardActivityEntry } from '@gruenerator/contracts';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@gruenerator/ui';
import { memo } from 'react';
import { FiActivity } from 'react-icons/fi';

import { useBoardActivityFeed } from '../../hooks/useBoardActivityFeed';
import { activityRelativeTime } from '../../utils/activityFormat';

import { RobotAvatar } from '@/components/common/RobotAvatar';

interface BoardActivitySheetProps {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VERB: Record<ActivityType, string> = {
  card_created: 'hat eine Karte erstellt',
  card_moved: 'hat eine Karte verschoben',
  assignees_changed: 'hat die Zuständigkeit geändert',
  labels_changed: 'hat Labels geändert',
  due_changed: 'hat eine Fälligkeit geändert',
  card_archived: 'hat eine Karte archiviert',
  card_restored: 'hat eine Karte wiederhergestellt',
  comment_added: 'hat kommentiert',
  attachment_added: 'hat einen Anhang hinzugefügt',
  board_renamed: 'hat das Board umbenannt',
  board_archived: 'hat das Board archiviert',
  board_restored: 'hat das Board wiederhergestellt',
  board_duplicated: 'hat das Board dupliziert',
};

/** Board-wide activity feed (A8) in a right-side sheet, opened from the ⋯ menu. */
export const BoardActivitySheet = memo(function BoardActivitySheet({
  boardId,
  open,
  onOpenChange,
}: BoardActivitySheetProps) {
  const { feedQuery } = useBoardActivityFeed(boardId, open);
  const entries: BoardActivityEntry[] = feedQuery.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[24rem] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <FiActivity size={16} />
            Aktivität
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-2">
          {feedQuery.isLoading ? (
            <p className="text-sm text-grey-400 px-1 py-4">Wird geladen…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-grey-400 px-1 py-4">Noch keine Aktivität.</p>
          ) : (
            <div className="space-y-3">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  <RobotAvatar
                    robotId={e.author_avatar_robot_id ?? 1}
                    displayName={e.author_name ?? ''}
                    sizePx={18}
                    className="w-[18px] h-[18px] shrink-0"
                    alt=""
                  />
                  <span className="text-foreground">
                    <span className="font-medium">{e.author_name ?? 'Jemand'}</span>{' '}
                    <span className="text-grey-500">{VERB[e.type] ?? 'hat etwas geändert'}</span>
                  </span>
                  <span className="ml-auto text-grey-400 shrink-0">
                    {activityRelativeTime(e.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});
