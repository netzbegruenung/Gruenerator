import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiSearch } from 'react-icons/fi';

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

const MAX_PEOPLE = 6;

// Typing "@agents" (or "@agent") jumps straight into the agent sub-view.
const isAgentsTrigger = (q: string) => /^agents?$/i.test(q.trim());

export const UserMentionPopover = memo(function UserMentionPopover({
  boardId,
  query,
  visible,
  anchorRect,
  onSelect,
  selectedIndex,
}: UserMentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggeredRef = useRef(false);

  const [view, setView] = useState<'root' | 'agents'>('root');
  const [agentSearch, setAgentSearch] = useState('');

  const { data: members = [] } = useAssignableMembers(visible ? boardId : undefined);
  const agents = useBoardAgentOptions(agentSearch);

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

  const showAgentsEntry = !!botMember;
  const total = people.length + (showAgentsEntry ? 1 : 0);
  const activeIndex = total > 0 ? Math.min(selectedIndex, total - 1) : 0;

  // Reset the sub-view whenever the popover closes.
  useEffect(() => {
    if (!visible) {
      setView('root');
      setAgentSearch('');
    }
  }, [visible]);

  // Rising-edge "@agents" jumps into the agent sub-view (once), so pressing back
  // doesn't immediately re-enter while the trigger text is still in the textarea.
  useEffect(() => {
    const trig = isAgentsTrigger(query);
    if (trig && !triggeredRef.current && botMember) setView('agents');
    if (botMember) triggeredRef.current = trig;
  }, [query, botMember]);

  // Autofocus the search field when entering the agent sub-view.
  useEffect(() => {
    if (visible && view === 'agents') searchRef.current?.focus();
  }, [visible, view]);

  // Keep the keyboard-highlighted root row in view.
  useEffect(() => {
    if (view !== 'root') return;
    listRef.current
      ?.querySelector(`[data-mention-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, view]);

  if (!visible || !anchorRect) return null;

  const containerClass =
    'fixed z-50 w-64 rounded-lg border border-grey-200 dark:border-grey-700 bg-background-pure shadow-lg overflow-hidden';
  const containerStyle = {
    left: anchorRect.x,
    top: anchorRect.y - 4,
    transform: 'translateY(-100%)',
  } as const;

  const rowClass = (isSelected: boolean) =>
    `flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors bg-transparent border-none cursor-pointer ${
      isSelected
        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
        : 'text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
    }`;

  // ── Agent sub-view: a searchable list of agents ─────────────────────────
  if (view === 'agents') {
    return (
      <div className={containerClass} style={containerStyle}>
        <div className="flex items-center gap-1.5 border-b border-grey-200 dark:border-grey-700 px-2 py-1.5">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setView('root');
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-grey-400 hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer transition-colors"
            title="Zurück"
          >
            <FiChevronLeft size={16} />
          </button>
          <FiSearch size={13} className="shrink-0 text-grey-400" />
          <input
            ref={searchRef}
            value={agentSearch}
            onChange={(e) => setAgentSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setView('root');
              }
            }}
            placeholder="Agent suchen…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-grey-400 dark:placeholder:text-grey-300"
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {agents.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-grey-400">
              Keine Agent*innen gefunden.
            </p>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.identifier}
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
                className={rowClass(false)}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-primary-600 dark:text-primary-400">
                  <PhosphorIcon name={agent.iconKey} className="h-4 w-4" />
                </span>
                <span className="truncate">{agent.title}</span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── Root view: people + an entry into the agent sub-view ────────────────
  if (people.length === 0 && !showAgentsEntry) return null;

  return (
    <div className={containerClass} style={containerStyle}>
      <div ref={listRef} className="max-h-60 overflow-y-auto py-1">
        {people.length > 0 && (
          <div className="px-3 pt-1.5 pb-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-grey-400">
              Personen
            </span>
          </div>
        )}
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

        {showAgentsEntry && (
          <button
            data-mention-index={people.length}
            onMouseDown={(e) => {
              e.preventDefault();
              setAgentSearch('');
              setView('agents');
            }}
            className={`${rowClass(people.length === activeIndex)} justify-between`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-primary-600 dark:text-primary-400">
                <PhosphorIcon name="PiRobot" className="h-4 w-4" />
              </span>
              <span className="truncate">Agent*innen durchsuchen</span>
            </span>
            <FiChevronRight size={14} className="shrink-0 text-grey-400" />
          </button>
        )}
      </div>
    </div>
  );
});
