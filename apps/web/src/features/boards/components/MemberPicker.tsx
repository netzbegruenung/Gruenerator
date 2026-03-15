/* eslint-disable react-hooks/set-state-in-effect */
import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { FiSearch, FiUserX } from 'react-icons/fi';

import type { CardAssignee } from '../types';

interface Member {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  avatar_robot_id: number;
}

interface MemberPickerProps {
  groupId: string;
  onSelect: (assignee: CardAssignee | null) => void;
  children: ReactNode;
}

export function MemberPicker({ groupId, onSelect, children }: MemberPickerProps) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open || !groupId) return;
    setLoading(true);
    fetch(`/api/auth/groups/${groupId}/members`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setMembers(data);
      })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [open, groupId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      const name = m.display_name || m.first_name || '';
      return !q || name.toLowerCase().includes(q);
    });
  }, [members, search]);

  const handleSelect = (member: Member | null) => {
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
          {loading && <p className="px-3 py-4 text-xs text-grey-400 text-center">Laden...</p>}
          {!loading &&
            filtered.map((member) => (
              <button
                key={member.user_id}
                onClick={() => handleSelect(member)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors bg-transparent border-none cursor-pointer"
              >
                <img
                  src={`/images/profileimages/${member.avatar_robot_id || 1}.svg`}
                  alt=""
                  className="w-6 h-6 rounded-full shrink-0"
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
