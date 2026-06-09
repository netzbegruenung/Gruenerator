import { type ActivityType, type BoardActivityEntry } from '@gruenerator/contracts';
import { memo } from 'react';
import { FiActivity } from 'react-icons/fi';

import { useBoardActivity } from '../hooks/useBoardActivity';
import { activityRelativeTime } from '../utils/activityFormat';

import { RobotAvatar } from '@/components/common/RobotAvatar';

interface CardActivityProps {
  boardId: string;
  cardId: string;
}

const VERB: Record<ActivityType, string> = {
  card_created: 'hat die Karte erstellt',
  card_moved: 'hat die Karte verschoben',
  assignees_changed: 'hat die Zuständigkeit geändert',
  labels_changed: 'hat die Labels geändert',
  due_changed: 'hat die Fälligkeit geändert',
  card_archived: 'hat die Karte archiviert',
  card_restored: 'hat die Karte wiederhergestellt',
  comment_added: 'hat kommentiert',
  attachment_added: 'hat einen Anhang hinzugefügt',
  board_renamed: 'hat das Board umbenannt',
  board_archived: 'hat das Board archiviert',
  board_restored: 'hat das Board wiederhergestellt',
  board_duplicated: 'hat das Board dupliziert',
};

export const CardActivity = memo(function CardActivity({ boardId, cardId }: CardActivityProps) {
  const { activityQuery } = useBoardActivity(boardId, cardId);
  const entries: BoardActivityEntry[] = activityQuery.data ?? [];

  if (entries.length === 0) return null;

  return (
    <div className="border-t border-grey-200 dark:border-grey-700 px-4 py-4 sm:px-6">
      <p className="text-sm font-medium text-grey-500 dark:text-grey-100 mb-3">
        <FiActivity className="inline mr-1.5" size={13} />
        Aktivität
      </p>
      <div className="space-y-2.5">
        {entries
          .slice()
          .reverse()
          .map((e) => (
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
    </div>
  );
});
