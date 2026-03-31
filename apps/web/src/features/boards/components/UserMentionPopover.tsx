import { getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

interface Member {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  avatar_robot_id: number;
}

export interface MentionUser {
  userId: string;
  displayName: string;
  avatarRobotId: number;
}

interface UserMentionPopoverProps {
  groupId: string | undefined;
  query: string;
  visible: boolean;
  anchorRect: { x: number; y: number } | null;
  onSelect: (user: MentionUser) => void;
  onDismiss: () => void;
  selectedIndex: number;
}

const MAX_RESULTS = 5;

export const UserMentionPopover = memo(function UserMentionPopover({
  groupId,
  query,
  visible,
  anchorRect,
  onSelect,
  onDismiss,
  selectedIndex,
}: UserMentionPopoverProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!groupId) return;
    fetch(`/api/auth/groups/${groupId}/members`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setMembers(data);
      })
      .catch(() => setMembers([]));
  }, [groupId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return members
      .filter((m) => {
        const name = (m.display_name || m.first_name || '').toLowerCase();
        return !q || name.includes(q);
      })
      .slice(0, MAX_RESULTS);
  }, [members, query]);

  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!visible || !anchorRect || filtered.length === 0) return null;

  return (
    <div
      className="fixed z-50 w-56 rounded-lg border border-grey-200 dark:border-grey-700 bg-background-pure shadow-lg overflow-hidden"
      style={{ left: anchorRect.x, top: anchorRect.y - 4, transform: 'translateY(-100%)' }}
    >
      <div className="px-2.5 py-1.5 border-b border-grey-200 dark:border-grey-700">
        <span className="text-[10px] font-medium text-grey-400 uppercase tracking-wide">
          Personen
        </span>
      </div>
      <div ref={listRef} className="max-h-48 overflow-y-auto py-1">
        {filtered.map((member, i) => {
          const name = member.display_name || member.first_name || 'Unbekannt';
          const isSelected = i === selectedIndex;
          return (
            <button
              key={member.user_id}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({
                  userId: member.user_id,
                  displayName: name,
                  avatarRobotId: member.avatar_robot_id || 1,
                });
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors bg-transparent border-none cursor-pointer ${
                isSelected
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
              }`}
            >
              <img
                src={getRobotAvatarPath(member.avatar_robot_id || 1)}
                alt=""
                className="w-5 h-5 rounded-full shrink-0"
              />
              <span className="truncate">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
