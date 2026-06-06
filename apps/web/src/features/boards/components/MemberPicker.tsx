import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { useState, useMemo, type ReactNode } from 'react';
import { FiSearch, FiUserX } from 'react-icons/fi';

import { type AssignableMember, useAssignableMembers } from '../hooks/useAssignableMembers';
import { type CardAssignee } from '../types';

import { RobotAvatar } from '@/components/common/RobotAvatar';

interface MemberPickerProps {
  boardId: string;
  onSelect: (assignee: CardAssignee | null) => void;
  children: ReactNode;
}

export function MemberPicker({ boardId, onSelect, children }: MemberPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: members = [], isLoading } = useAssignableMembers(open ? boardId : undefined);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      const name = m.display_name || m.first_name || '';
      return !q || name.toLowerCase().includes(q);
    });
  }, [members, search]);

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
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="p-2 border-b border-grey-200 dark:border-grey-700">
          <div className="flex items-center gap-2 rounded-md border border-grey-200 dark:border-grey-700 px-2 py-1.5">
            <FiSearch size={13} className="text-grey-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Person suchen..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-grey-400 dark:placeholder:text-grey-300"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto">
          <button
            onClick={() => handleSelect(null)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-grey-400 dark:text-grey-300 hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors bg-transparent border-none cursor-pointer"
          >
            <FiUserX size={14} className="shrink-0" />
            <span>Niemand</span>
          </button>
          {isLoading && <p className="px-3 py-4 text-xs text-grey-400 text-center">Laden...</p>}
          {!isLoading &&
            filtered.map((member) => (
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
                <span className="truncate">
                  {member.display_name || member.first_name || 'Unbekannt'}
                </span>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
