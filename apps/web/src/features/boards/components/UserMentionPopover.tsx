import { memo, useEffect, useMemo, useRef } from 'react';

import { useAssignableMembers } from '../hooks/useAssignableMembers';
import { useBoardAgentOptions } from '../hooks/useBoardAgentOptions';

import { RobotAvatar } from '@/components/common/RobotAvatar';
import { PhosphorIcon } from '@/features/agents/icons/PhosphorIcon';

export interface MentionUser {
  userId: string;
  displayName: string;
  avatarRobotId: number;
  /**
   * Set when an agent (not a person) was picked. The mention still uses the bot's
   * userId so the backend bot-detection enqueue fires; this identifier tells it
   * which specific agent should do the work.
   */
  agentId?: string;
}

interface UserMentionPopoverProps {
  boardId: string | undefined;
  query: string;
  visible: boolean;
  anchorRect: { x: number; y: number } | null;
  onSelect: (user: MentionUser) => void;
  onDismiss: () => void;
  selectedIndex: number;
}

const MAX_PEOPLE = 5;
const MAX_AGENTS = 6;

export const UserMentionPopover = memo(function UserMentionPopover({
  boardId,
  query,
  visible,
  anchorRect,
  onSelect,
  selectedIndex,
}: UserMentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const { data: members = [] } = useAssignableMembers(visible ? boardId : undefined);
  const agentOptions = useBoardAgentOptions(query);

  // Agent mentions are delegated to the always-assignable Grünerator bot member, so
  // the existing bot-detection enqueue fires; the chosen agentId rides alongside.
  const botMember = useMemo(() => members.find((m) => m.source === 'bot'), [members]);

  const people = useMemo(() => {
    const q = query.toLowerCase();
    return members
      .filter((m) => m.source !== 'bot')
      .filter((m) => {
        const name = (m.display_name || m.first_name || '').toLowerCase();
        return !q || name.includes(q);
      })
      .slice(0, MAX_PEOPLE);
  }, [members, query]);

  const agents = useMemo(
    () => (botMember ? agentOptions.slice(0, MAX_AGENTS) : []),
    [botMember, agentOptions]
  );

  const total = people.length + agents.length;
  const activeIndex = total > 0 ? Math.min(selectedIndex, total - 1) : 0;

  useEffect(() => {
    const selected = listRef.current?.querySelector(`[data-mention-index="${activeIndex}"]`);
    selected?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!visible || !anchorRect || total === 0) return null;

  const rowClass = (isSelected: boolean) =>
    `flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors bg-transparent border-none cursor-pointer ${
      isSelected
        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
        : 'text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
    }`;

  const sectionLabel = (text: string) => (
    <div className="px-3 pt-1.5 pb-0.5">
      <span className="text-[10px] font-medium text-grey-400 uppercase tracking-wide">{text}</span>
    </div>
  );

  return (
    <div
      className="fixed z-50 w-60 rounded-lg border border-grey-200 dark:border-grey-700 bg-background-pure shadow-lg overflow-hidden"
      style={{ left: anchorRect.x, top: anchorRect.y - 4, transform: 'translateY(-100%)' }}
    >
      <div ref={listRef} className="max-h-60 overflow-y-auto py-1">
        {people.length > 0 && sectionLabel('Personen')}
        {people.map((member, i) => {
          const name = member.display_name || member.first_name || 'Unbekannt';
          return (
            <button
              key={member.user_id}
              data-mention-index={i}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({
                  userId: member.user_id,
                  displayName: name,
                  avatarRobotId: member.avatar_robot_id || 1,
                });
              }}
              className={rowClass(i === activeIndex)}
            >
              <RobotAvatar
                robotId={member.avatar_robot_id || 1}
                displayName={name}
                sizePx={20}
                className="w-5 h-5 shrink-0"
                alt=""
              />
              <span className="truncate">{name}</span>
            </button>
          );
        })}

        {agents.length > 0 && sectionLabel('Agent*innen')}
        {agents.map((agent, j) => {
          const index = people.length + j;
          return (
            <button
              key={agent.identifier}
              data-mention-index={index}
              onMouseDown={(e) => {
                e.preventDefault();
                if (!botMember) return;
                onSelect({
                  userId: botMember.user_id,
                  displayName: agent.title,
                  avatarRobotId: botMember.avatar_robot_id || 1,
                  agentId: agent.identifier,
                });
              }}
              className={rowClass(index === activeIndex)}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-foreground-muted">
                <PhosphorIcon name={agent.iconKey} className="h-4 w-4" />
              </span>
              <span className="truncate">{agent.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
