import { useConfirm } from '@gruenerator/ui';
import { memo, useCallback, useState } from 'react';
import { FiCheckSquare, FiPlus, FiTrash2, FiUserPlus, FiX } from 'react-icons/fi';

import {
  checklistProgress,
  type CardAssignee,
  type ChecklistGroup,
  type ChecklistItem,
} from '../types';

import { MemberPicker } from './MemberPicker';

import { RobotAvatar } from '@/components/common/RobotAvatar';
import { cn } from '@/utils/cn';

interface CardChecklistsProps {
  groups: ChecklistGroup[];
  currentUserId?: string;
  /** Board context — enables assigning a person to a single checklist item. */
  boardId?: string;
  /** Persist the next checklist state (caller serializes into the cell). */
  onChange: (groups: ChecklistGroup[]) => void;
}

function rid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Card checklists section. Pure-Yjs feature: the parent stores the serialized
 * groups in the FIELD_IDS.CHECKLIST cell, so every mutation routes through
 * `onChange` with the full next array (collaborative, last-write-wins per cell).
 */
export const CardChecklists = memo(function CardChecklists({
  groups,
  currentUserId,
  boardId,
  onChange,
}: CardChecklistsProps) {
  const confirm = useConfirm();
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [newGroupTitle, setNewGroupTitle] = useState('');

  const mutate = useCallback(
    (fn: (draft: ChecklistGroup[]) => ChecklistGroup[]) => {
      onChange(fn(groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i })) }))));
    },
    [groups, onChange]
  );

  const addGroup = useCallback(() => {
    const title = newGroupTitle.trim();
    if (!title) return;
    mutate((draft) => [...draft, { id: rid('cl'), title, items: [] }]);
    setNewGroupTitle('');
  }, [newGroupTitle, mutate]);

  const deleteGroup = useCallback(
    (groupId: string) => mutate((draft) => draft.filter((g) => g.id !== groupId)),
    [mutate]
  );

  const addItem = useCallback(
    (groupId: string) => {
      const text = (newItemText[groupId] ?? '').trim();
      if (!text) return;
      mutate((draft) =>
        draft.map((g) =>
          g.id === groupId
            ? { ...g, items: [...g.items, { id: rid('cli'), text, done: false }] }
            : g
        )
      );
      setNewItemText((s) => ({ ...s, [groupId]: '' }));
    },
    [newItemText, mutate]
  );

  const toggleItem = useCallback(
    (groupId: string, itemId: string) => {
      mutate((draft) =>
        draft.map((g) =>
          g.id !== groupId
            ? g
            : {
                ...g,
                items: g.items.map(
                  (it): ChecklistItem =>
                    it.id !== itemId
                      ? it
                      : it.done
                        ? { id: it.id, text: it.text, done: false }
                        : {
                            id: it.id,
                            text: it.text,
                            done: true,
                            doneBy: currentUserId,
                            doneAt: new Date().toISOString(),
                          }
                ),
              }
        )
      );
    },
    [mutate, currentUserId]
  );

  const deleteItem = useCallback(
    (groupId: string, itemId: string) => {
      mutate((draft) =>
        draft.map((g) =>
          g.id === groupId ? { ...g, items: g.items.filter((it) => it.id !== itemId) } : g
        )
      );
    },
    [mutate]
  );

  const setItemAssignee = useCallback(
    (groupId: string, itemId: string, assignee: CardAssignee | null) => {
      mutate((draft) =>
        draft.map((g) =>
          g.id !== groupId
            ? g
            : {
                ...g,
                items: g.items.map((it) => {
                  if (it.id !== itemId) return it;
                  if (assignee) return { ...it, assignee };
                  const { assignee: _drop, ...rest } = it;
                  return rest;
                }),
              }
        )
      );
    },
    [mutate]
  );

  return (
    <div className="flex flex-row items-start">
      <p className="w-24 shrink-0 text-sm font-medium text-grey-500 dark:text-grey-100 pt-1.5">
        <FiCheckSquare className="inline mr-1.5" size={13} />
        Checkliste
      </p>
      <div className="flex-1 space-y-3">
        {groups.map((group) => {
          const { done, total } = checklistProgress([group]);
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div key={group.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground flex-1 truncate">
                  {group.title}
                </span>
                <span className="text-[11px] text-grey-400 shrink-0">
                  {done}/{total}
                </span>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Checkliste löschen?',
                      description: `„${group.title}" und alle Einträge darin werden gelöscht.`,
                    });
                    if (ok) deleteGroup(group.id);
                  }}
                  className="text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-2 sm:p-1"
                  title="Checkliste löschen"
                >
                  <FiTrash2 size={12} />
                </button>
              </div>
              {total > 0 && (
                <div className="h-1 w-full rounded-full bg-grey-200 dark:bg-grey-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 group/item">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleItem(group.id, item.id)}
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary-500"
                    />
                    <span
                      className={cn(
                        'text-sm flex-1 leading-snug',
                        item.done ? 'text-grey-400 line-through' : 'text-foreground'
                      )}
                    >
                      {item.text}
                    </span>
                    {boardId && (
                      <MemberPicker
                        boardId={boardId}
                        onSelect={(a) => setItemAssignee(group.id, item.id, a)}
                      >
                        {item.assignee ? (
                          <button
                            className="shrink-0 bg-transparent border-none cursor-pointer p-0"
                            title={`Zuständig: ${item.assignee.name}`}
                          >
                            <RobotAvatar
                              robotId={item.assignee.avatarRobotId ?? 1}
                              displayName={item.assignee.name}
                              sizePx={18}
                              className="w-[18px] h-[18px] rounded-full"
                              alt={item.assignee.name}
                            />
                          </button>
                        ) : (
                          <button
                            className="sm:opacity-0 sm:group-hover/item:opacity-100 text-grey-400 hover:text-primary-600 bg-transparent border-none cursor-pointer transition-opacity p-1"
                            title="Person zuweisen"
                          >
                            <FiUserPlus size={13} />
                          </button>
                        )}
                      </MemberPicker>
                    )}
                    <button
                      onClick={() => deleteItem(group.id, item.id)}
                      className="sm:opacity-0 sm:group-hover/item:opacity-100 text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer transition-opacity p-2 sm:p-1"
                      title="Eintrag entfernen"
                    >
                      <FiX size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <input
                value={newItemText[group.id] ?? ''}
                onChange={(e) => setNewItemText((s) => ({ ...s, [group.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(group.id);
                  }
                }}
                placeholder="Eintrag hinzufügen…"
                className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary-500 placeholder:text-grey-400 dark:placeholder:text-grey-300"
              />
            </div>
          );
        })}
        <div className="flex items-center gap-1.5">
          <input
            value={newGroupTitle}
            onChange={(e) => setNewGroupTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addGroup();
              }
            }}
            placeholder="Neue Checkliste…"
            className="flex-1 rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary-500 placeholder:text-grey-400 dark:placeholder:text-grey-300"
          />
          <button
            onClick={addGroup}
            className="flex items-center gap-1 text-xs text-grey-400 hover:text-primary-600 bg-transparent border-none cursor-pointer px-1.5 py-1"
            title="Checkliste anlegen"
          >
            <FiPlus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
});
