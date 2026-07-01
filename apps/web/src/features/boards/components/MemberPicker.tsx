import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { useState, useMemo, type ReactNode } from 'react';
import { FiCheck, FiSearch, FiUserX } from 'react-icons/fi';

import { PhosphorIcon } from '../../agents/icons/PhosphorIcon';
import { type AssignableMember, useAssignableMembers } from '../hooks/useAssignableMembers';
import { useBoardAgentOptions, type BoardAgentOption } from '../hooks/useBoardAgentOptions';
import { type CardAssignee } from '../types';

import { RobotAvatar } from '@/components/common/RobotAvatar';

interface MemberPickerProps {
  boardId: string;
  onSelect: (assignee: CardAssignee | null) => void;
  children: ReactNode;
  /** When set, the picker shows a checkmark next to these member ids. */
  selectedIds?: string[];
  /** Multi-select mode: toggling a member keeps the popover open. */
  multiple?: boolean;
}

export function MemberPicker({
  boardId,
  onSelect,
  children,
  selectedIds,
  multiple = false,
}: MemberPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: members = [], isLoading } = useAssignableMembers(open ? boardId : undefined);
  const agents = useBoardAgentOptions(open ? search : '');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      const name = m.display_name || m.first_name || '';
      return !q || name.toLowerCase().includes(q);
    });
  }, [members, search]);

  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

  const closeUnlessMulti = () => {
    // In multi-select keep the popover open so several can be toggled in a row.
    if (!multiple) {
      setOpen(false);
      setSearch('');
    }
  };

  const handleSelect = (member: AssignableMember | null) => {
    if (member) {
      onSelect({
        id: member.user_id,
        name: member.display_name || member.first_name || 'Unbekannt',
        avatarRobotId: member.avatar_robot_id || 1,
      });
    } else {
      onSelect(null);
    }
    closeUnlessMulti();
  };

  // Assigning an agent delegates the card's task to it. Its id is the identifier
  // slug (excluded from notification uuid[] server-side); avatarRobotId is unused
  // (agent chips render an icon).
  const handleSelectAgent = (agent: BoardAgentOption) => {
    onSelect({
      id: agent.identifier,
      name: agent.title,
      avatarRobotId: 1,
      agentId: agent.identifier,
    });
    closeUnlessMulti();
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="p-2 border-b border-grey-200 dark:border-grey-700">
          <div className="flex items-center gap-2 rounded-md border border-grey-200 dark:border-grey-700 px-2 py-1.5">
            <FiSearch size={13} className="text-grey-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Person oder Agent suchen..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-grey-400 dark:placeholder:text-grey-300"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto scroll-py-1">
          <button
            onClick={() => handleSelect(null)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-grey-400 dark:text-grey-300 hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors bg-transparent border-none cursor-pointer"
          >
            <FiUserX size={14} className="shrink-0" />
            <span>Niemand</span>
          </button>
          {isLoading && <p className="px-3 py-4 text-xs text-grey-400 text-center">Laden...</p>}
          {!isLoading &&
            filtered.map((member) => {
              const isSelected = selected.has(member.user_id);
              return (
                <button
                  key={member.user_id}
                  onClick={() => handleSelect(member)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors bg-transparent border-none cursor-pointer"
                >
                  <RobotAvatar
                    robotId={member.avatar_robot_id || 1}
                    displayName={member.display_name || member.first_name}
                    sizePx={24}
                    className="w-6 h-6 shrink-0"
                    alt=""
                  />
                  <span className="truncate flex-1">
                    {member.display_name || member.first_name || 'Unbekannt'}
                  </span>
                  {isSelected && <FiCheck size={14} className="shrink-0 text-primary-600" />}
                </button>
              );
            })}

          {agents.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 border-t border-grey-100 dark:border-grey-800">
                <span className="text-[10px] font-medium text-grey-400 uppercase tracking-wide">
                  Agent*innen
                </span>
              </div>
              {agents.map((agent) => {
                const isSelected = selected.has(agent.identifier);
                return (
                  <button
                    key={agent.identifier}
                    onClick={() => handleSelectAgent(agent)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors bg-transparent border-none cursor-pointer"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center text-primary-600 dark:text-primary-400">
                      <PhosphorIcon name={agent.iconKey} className="h-4 w-4" />
                    </span>
                    <span className="truncate flex-1">{agent.title}</span>
                    {isSelected && <FiCheck size={14} className="shrink-0 text-primary-600" />}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
