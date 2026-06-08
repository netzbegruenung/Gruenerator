import { useAgentStore } from '@gruenerator/chat';
import {
  Badge,
  Button,
  Calendar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
} from '@gruenerator/ui';
import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiCheck,
  FiTrash2,
  FiCalendar,
  FiTag,
  FiMessageSquare,
  FiFileText,
  FiPlus,
  FiUser,
  FiMoreHorizontal,
  FiCopy,
  FiArchive,
  FiX,
  FiEye,
  FiEyeOff,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { useBoardActivity } from '../hooks/useBoardActivity';
import { useCardSubscription } from '../hooks/useCardSubscription';
import { FIELD_IDS, parseAssignees, parseChecklists, serializeAssignees } from '../types';
import { LABEL_COLORS } from '../utils/boardDefaults';

import { CardActivity } from './CardActivity';
import { CardAttachments } from './CardAttachments';
import { CardChecklists } from './CardChecklists';
import { CardComments } from './CardComments';
import { CardDescription } from './CardDescription';
import { MemberPicker } from './MemberPicker';

import type {
  Row,
  Field,
  SelectOption,
  CellValue,
  LinkedDoc,
  CardAssignee,
  ChecklistGroup,
} from '../types';

import { CollabDocPicker } from '@/components/common/CollabDocPicker';
import { RobotAvatar } from '@/components/common/RobotAvatar';
import { cn } from '@/utils/cn';

// "No colour" choice for a new label — a neutral grey so the chip still renders.
const NEUTRAL_LABEL_COLOR = '#9ca3af';

const COMMON_EMOJI = [
  '📋',
  '📌',
  '🎯',
  '🔥',
  '⭐',
  '💡',
  '🚀',
  '✅',
  '⚡',
  '🎨',
  '📝',
  '🔧',
  '📢',
  '🌱',
  '🤝',
  '📅',
  '❗',
  '🏁',
  '💬',
  '🔍',
  '📊',
  '🎉',
  '⏰',
  '🛑',
];

function EmojiPicker({ value, onChange }: { value?: string; onChange: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center justify-center w-9 h-9 mt-0.5 shrink-0 rounded-md text-lg hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border border-dashed border-grey-200 dark:border-grey-700 cursor-pointer transition-colors"
          title="Icon wählen"
        >
          {value || '😀'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-8 gap-0.5">
          {COMMON_EMOJI.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onChange(emoji);
                setOpen(false);
              }}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer text-lg transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
        {value && (
          <button
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="w-full mt-1 text-xs text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer py-1"
          >
            Icon entfernen
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface CardDetailPanelProps {
  row: Row | null;
  fields: Field[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateCell: (rowId: string, fieldId: string, value: CellValue) => void;
  onUpdateRow: (rowId: string, updates: Partial<Row>) => void;
  onDelete: (rowId: string) => void;
  onDuplicate?: (rowId: string) => void;
  onUpdateField: (fieldId: string, updates: Partial<Field>) => void;
  boardId?: string;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatarRobotId?: number;
  onPrevCard?: () => void;
  onNextCard?: () => void;
}

export const CardDetailPanel = memo(function CardDetailPanel({
  row,
  fields,
  open,
  onOpenChange,
  onUpdateCell,
  onUpdateRow,
  onDelete,
  onDuplicate,
  onUpdateField,
  boardId,
  currentUserId = '',
  currentUserName = '',
  currentUserAvatarRobotId = 1,
  onPrevCard,
  onNextCard,
}: CardDetailPanelProps) {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);
  const [newLabelText, setNewLabelText] = useState('');
  const [selectedLabelColor, setSelectedLabelColor] = useState(LABEL_COLORS[0]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [assignees, setAssignees] = useState<CardAssignee[]>([]);
  const [checklists, setChecklists] = useState<ChecklistGroup[]>([]);

  // Activity recording + watch toggle (relational; keyed on the open card).
  const activeCardId = row?.id ?? '';
  const { record: recordActivity } = useBoardActivity(boardId, activeCardId);
  const { subscriptionQuery, toggle: toggleSubscription } = useCardSubscription(
    boardId,
    activeCardId
  );
  const isWatching = subscriptionQuery.data?.subscribed ?? false;

  const labelsField = useMemo(() => fields.find((f) => f.id === FIELD_IDS.LABELS), [fields]);
  const labelOptions = useMemo(
    () => (labelsField?.typeOptions.options ?? []) as SelectOption[],
    [labelsField]
  );

  // Keyboard navigation: ArrowLeft → prev card, ArrowRight → next card
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable)
        return;
      if (e.key === 'ArrowLeft' && onPrevCard) {
        e.preventDefault();
        onPrevCard();
      } else if (e.key === 'ArrowRight' && onNextCard) {
        e.preventDefault();
        onNextCard();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onPrevCard, onNextCard]);

  // Sync local state from row when panel opens or row changes
  const rowId = row?.id;
  useEffect(() => {
    if (!row) return;
    setTitle((row.cells[FIELD_IDS.TITLE] as string) || '');
    setDescription((row.cells[FIELD_IDS.DESCRIPTION] as string) || '');
    setDueDate((row.cells[FIELD_IDS.DUE_DATE] as string) || '');
    setSelectedLabelIds((row.cells[FIELD_IDS.LABELS] ?? []) as string[]);
    try {
      const raw = row.cells[FIELD_IDS.LINKED_DOCS];
      setLinkedDocs(typeof raw === 'string' ? (JSON.parse(raw) as LinkedDoc[]) : []);
    } catch {
      setLinkedDocs([]);
    }
    setAssignees(parseAssignees(row.cells[FIELD_IDS.ASSIGNEE]));
    setChecklists(parseChecklists(row.cells[FIELD_IDS.CHECKLIST]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally sync only on row change or panel open
  }, [rowId, open]);

  const handleTitleBlur = useCallback(() => {
    if (!row) return;
    const trimmed = title.trim();
    if (trimmed && trimmed !== row.cells[FIELD_IDS.TITLE]) {
      onUpdateCell(row.id, FIELD_IDS.TITLE, trimmed);
    }
  }, [row, title, onUpdateCell]);

  const toggleLabel = useCallback(
    (labelId: string) => {
      if (!row) return;
      const updated = selectedLabelIds.includes(labelId)
        ? selectedLabelIds.filter((id) => id !== labelId)
        : [...selectedLabelIds, labelId];
      setSelectedLabelIds(updated);
      onUpdateCell(row.id, FIELD_IDS.LABELS, updated);
    },
    [row, selectedLabelIds, onUpdateCell]
  );

  // Explicit removal — works even for labels whose board option no longer exists
  // (e.g. the option was deleted but the card still references the id), which the
  // toggle list below can't show.
  const removeLabel = useCallback(
    (labelId: string) => {
      if (!row) return;
      const updated = selectedLabelIds.filter((id) => id !== labelId);
      setSelectedLabelIds(updated);
      onUpdateCell(row.id, FIELD_IDS.LABELS, updated);
    },
    [row, selectedLabelIds, onUpdateCell]
  );

  // The labels currently on the card, resolved to {id,name,color} — with a
  // fallback for orphaned ids so they remain visible and removable.
  const selectedLabels = useMemo(
    () =>
      selectedLabelIds.map((id) => {
        const opt = labelOptions.find((o) => o.id === id);
        return { id, name: opt?.name ?? 'Label', color: opt?.color ?? '#9ca3af' };
      }),
    [selectedLabelIds, labelOptions]
  );

  const addNewLabel = useCallback(() => {
    if (!row || !labelsField) return;
    const trimmed = newLabelText.trim();
    if (!trimmed) return;
    const newId = `label-${Date.now()}`;
    const newOption: SelectOption = { id: newId, name: trimmed, color: selectedLabelColor };
    const updatedOptions = [...labelOptions, newOption];
    onUpdateField(labelsField.id, {
      typeOptions: { ...labelsField.typeOptions, options: updatedOptions },
    });
    const updated = [...selectedLabelIds, newId];
    setSelectedLabelIds(updated);
    onUpdateCell(row.id, FIELD_IDS.LABELS, updated);
    setNewLabelText('');
  }, [
    row,
    labelsField,
    newLabelText,
    selectedLabelColor,
    labelOptions,
    selectedLabelIds,
    onUpdateField,
    onUpdateCell,
  ]);

  const addLinkedDoc = useCallback(
    (doc: LinkedDoc) => {
      if (!row) return;
      const updated = [...linkedDocs, doc];
      setLinkedDocs(updated);
      onUpdateCell(row.id, FIELD_IDS.LINKED_DOCS, JSON.stringify(updated));
    },
    [row, linkedDocs, onUpdateCell]
  );

  const removeLinkedDoc = useCallback(
    (docId: string) => {
      if (!row) return;
      const updated = linkedDocs.filter((d) => d.id !== docId);
      setLinkedDocs(updated);
      onUpdateCell(row.id, FIELD_IDS.LINKED_DOCS, JSON.stringify(updated));
    },
    [row, linkedDocs, onUpdateCell]
  );

  const persistAssignees = useCallback(
    (next: CardAssignee[]) => {
      if (!row) return;
      setAssignees(next);
      onUpdateCell(row.id, FIELD_IDS.ASSIGNEE, serializeAssignees(next));
      recordActivity.mutate({
        type: 'assignees_changed',
        payload: { names: next.map((a) => a.name) },
      });
    },
    [row, onUpdateCell, recordActivity]
  );

  // Multi-select: picking a member toggles them in/out of the assignee list.
  const handleAssigneeToggle = useCallback(
    (member: CardAssignee | null) => {
      if (member === null) {
        persistAssignees([]);
        return;
      }
      const exists = assignees.some((a) => a.id === member.id && a.id !== '');
      persistAssignees(
        exists ? assignees.filter((a) => a.id !== member.id) : [...assignees, member]
      );
    },
    [assignees, persistAssignees]
  );

  const removeAssignee = useCallback(
    (id: string, name: string) => {
      persistAssignees(assignees.filter((a) => !(a.id === id && a.name === name)));
    },
    [assignees, persistAssignees]
  );

  const handleChecklistChange = useCallback(
    (next: ChecklistGroup[]) => {
      if (!row) return;
      setChecklists(next);
      onUpdateCell(row.id, FIELD_IDS.CHECKLIST, JSON.stringify(next));
    },
    [row, onUpdateCell]
  );

  const handleArchive = useCallback(() => {
    if (!row) return;
    onUpdateRow(row.id, { archivedAt: new Date().toISOString() });
    recordActivity.mutate({ type: 'card_archived' });
    onOpenChange(false);
  }, [row, onUpdateRow, onOpenChange, recordActivity]);

  const handleCoverImageChange = useCallback(
    (url: string | null) => {
      if (!row) return;
      onUpdateRow(row.id, { coverImageUrl: url ?? undefined });
    },
    [row, onUpdateRow]
  );

  const handleDuplicate = useCallback(() => {
    if (!row || !onDuplicate) return;
    onDuplicate(row.id);
    onOpenChange(false);
  }, [row, onDuplicate, onOpenChange]);

  const handleDiscussInChat = useCallback(() => {
    if (!row) return;
    let text = `Ich möchte diese Aufgabe besprechen:\n\n**${title}**`;
    if (description) text += `\n${description}`;
    if (dueDate) text += `\nFällig: ${dueDate}`;

    useAgentStore.getState().setPendingDraft(text);
    useAgentStore.getState().setChatViewMode('thread');
    onOpenChange(false);
    void navigate('/chat');
  }, [row, title, description, dueDate, onOpenChange, navigate]);

  const handleSave = useCallback(() => {
    if (!row) return;
    onUpdateCell(row.id, FIELD_IDS.TITLE, title.trim() || (row.cells[FIELD_IDS.TITLE] as string));
    onUpdateCell(row.id, FIELD_IDS.DESCRIPTION, description);
    onUpdateCell(row.id, FIELD_IDS.DUE_DATE, dueDate || null);
    onUpdateCell(row.id, FIELD_IDS.LABELS, selectedLabelIds);
    onOpenChange(false);
  }, [row, title, description, dueDate, selectedLabelIds, onUpdateCell, onOpenChange]);

  if (!row) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-[28rem] p-0 flex flex-col"
        showCloseButton={false}
      >
        {row.coverColor && (
          <div className="h-2 shrink-0" style={{ backgroundColor: row.coverColor }} />
        )}
        <div className="flex items-center justify-between border-b border-grey-200 dark:border-grey-700 px-4 py-3 sm:px-6">
          <SheetTitle className="text-sm font-medium text-grey-500">Karte bearbeiten</SheetTitle>
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center w-10 h-10 sm:w-7 sm:h-7 rounded-md text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer transition-colors"
                  title="Aktionen"
                >
                  <FiMoreHorizontal size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {onDuplicate && (
                  <DropdownMenuItem onClick={handleDuplicate}>
                    <FiCopy className="mr-2" size={13} />
                    Duplizieren
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleArchive}>
                  <FiArchive className="mr-2" size={13} />
                  Archivieren
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    onDelete(row.id);
                    onOpenChange(false);
                  }}
                >
                  <FiTrash2 className="mr-2" size={13} />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-center w-10 h-10 sm:w-7 sm:h-7 rounded-md text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer transition-colors"
            >
              <span className="text-lg leading-none">&times;</span>
            </button>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 'var(--mobile-keyboard-offset, 0px)' }}
        >
          <div className="px-4 pt-6 pb-2 sm:px-6">
            <div className="flex items-start gap-2">
              <EmojiPicker
                value={row.icon}
                onChange={(icon) => onUpdateRow(row.id, { icon: icon || undefined })}
              />
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                rows={1}
                className="w-full text-xl font-bold bg-transparent border-none outline-none text-foreground-heading resize-none leading-relaxed"
                placeholder="Kartentitel"
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />
            </div>
          </div>

          <div className="px-4 sm:px-6 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-grey-400 mr-1">Cover</span>
              {/* None — clears the cover color (highlighted when no cover set). */}
              <button
                onClick={() => onUpdateRow(row.id, { coverColor: undefined })}
                className={cn(
                  'flex h-3 w-5 items-center justify-center rounded-sm border border-grey-300 dark:border-grey-600 cursor-pointer transition-transform hover:scale-125 bg-transparent',
                  !row.coverColor && 'ring-2 ring-primary-500 ring-offset-1'
                )}
                title="Kein Cover"
                aria-label="Kein Cover"
              >
                <FiX size={9} className="text-grey-400" />
              </button>
              {LABEL_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() =>
                    onUpdateRow(row.id, {
                      coverColor: row.coverColor === color ? undefined : color,
                    })
                  }
                  className={cn(
                    'w-5 h-3 rounded-sm border-none cursor-pointer transition-transform hover:scale-125',
                    row.coverColor === color && 'ring-2 ring-primary-500 ring-offset-1'
                  )}
                  style={{ backgroundColor: color }}
                  title={row.coverColor === color ? 'Cover entfernen' : 'Cover setzen'}
                />
              ))}
            </div>
          </div>

          <div className="px-4 pb-6 sm:px-6">
            <CardDescription
              value={description}
              onSave={(md) => {
                setDescription(md);
                if (row) onUpdateCell(row.id, FIELD_IDS.DESCRIPTION, md);
              }}
            />
          </div>

          <div className="border-t border-grey-200 dark:border-grey-700 px-4 py-4 space-y-4 sm:px-6">
            {/* Labels */}
            <div className="flex flex-row">
              <p className="w-24 shrink-0 text-sm font-medium text-grey-500 dark:text-grey-100 pt-1.5">
                <FiTag className="inline mr-1.5" size={13} />
                Labels
              </p>
              <div className="flex-1">
                {/* Assigned labels — explicit removable chips (always available). */}
                {selectedLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedLabels.map((lbl) => (
                      <span
                        key={lbl.id}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: lbl.color }}
                      >
                        {lbl.name}
                        <button
                          onClick={() => removeLabel(lbl.id)}
                          className="flex items-center justify-center bg-transparent border-none cursor-pointer p-1.5 sm:p-0.5 -mr-1 text-white/80 hover:text-white"
                          title="Label entfernen"
                          aria-label={`Label ${lbl.name} entfernen`}
                        >
                          <FiX size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {/* Add labels — click an option to assign (already-assigned hidden). */}
                {labelOptions.some((o) => !selectedLabelIds.includes(o.id)) && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {labelOptions
                      .filter((opt) => !selectedLabelIds.includes(opt.id))
                      .map((opt) => (
                        <Badge
                          key={opt.id}
                          className="cursor-pointer text-xs"
                          style={{ backgroundColor: 'transparent' }}
                          variant="outline"
                          onClick={() => toggleLabel(opt.id)}
                          title="Label hinzufügen"
                        >
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-1 shrink-0"
                            style={{ backgroundColor: opt.color }}
                          />
                          {opt.name}
                        </Badge>
                      ))}
                  </div>
                )}
                <div className="flex gap-1.5 items-center">
                  <input
                    value={newLabelText}
                    onChange={(e) => setNewLabelText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addNewLabel();
                      }
                    }}
                    placeholder="Neues Label..."
                    className="flex-1 rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-2.5 sm:py-1.5 text-sm outline-none focus:border-primary-500 placeholder:text-grey-400 dark:placeholder:text-grey-300"
                  />
                  <div className="flex gap-2 sm:gap-1">
                    {colorPickerOpen ? (
                      <>
                        {/* None — neutral/colorless label (first option, "undo"). */}
                        <button
                          onClick={() => {
                            setSelectedLabelColor(NEUTRAL_LABEL_COLOR);
                            setColorPickerOpen(false);
                          }}
                          className="flex h-7 w-7 sm:h-5 sm:w-5 items-center justify-center rounded-full border border-grey-300 dark:border-grey-600 cursor-pointer transition-transform hover:scale-110 bg-transparent"
                          style={{
                            outline:
                              selectedLabelColor === NEUTRAL_LABEL_COLOR
                                ? '2px solid currentColor'
                                : 'none',
                            outlineOffset: '2px',
                          }}
                          title="Keine Farbe"
                          aria-label="Keine Farbe"
                        >
                          <FiX size={11} className="text-grey-400" />
                        </button>
                        {LABEL_COLORS.slice(0, 5).map((color) => (
                          <button
                            key={color}
                            onClick={() => {
                              setSelectedLabelColor(color);
                              setColorPickerOpen(false);
                            }}
                            className="w-7 h-7 sm:w-5 sm:h-5 rounded-full border-none cursor-pointer transition-transform hover:scale-110"
                            style={{
                              backgroundColor: color,
                              outline:
                                selectedLabelColor === color ? '2px solid currentColor' : 'none',
                              outlineOffset: '2px',
                            }}
                          />
                        ))}
                      </>
                    ) : selectedLabelColor === NEUTRAL_LABEL_COLOR ? (
                      <button
                        onClick={() => setColorPickerOpen(true)}
                        className="flex h-7 w-7 sm:h-5 sm:w-5 items-center justify-center rounded-full border border-grey-300 dark:border-grey-600 cursor-pointer transition-transform hover:scale-110 bg-transparent"
                        title="Farbe wählen"
                        aria-label="Farbe wählen"
                      >
                        <FiX size={11} className="text-grey-400" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setColorPickerOpen(true)}
                        className="w-7 h-7 sm:w-5 sm:h-5 rounded-full border-none cursor-pointer transition-transform hover:scale-110"
                        style={{ backgroundColor: selectedLabelColor }}
                        title="Farbe wählen"
                        aria-label="Farbe wählen"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Assignees — available whenever the card has a board context */}
            {boardId && (
              <div className="flex flex-row">
                <p className="w-24 shrink-0 text-sm font-medium text-grey-500 dark:text-grey-100 pt-1.5">
                  <FiUser className="inline mr-1.5" size={13} />
                  Zuständig
                </p>
                <div className="flex-1">
                  {assignees.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {assignees.map((a) => (
                        <span
                          key={`${a.id}-${a.name}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-grey-100 dark:bg-grey-800 pl-1 pr-1.5 py-0.5 group/assignee"
                        >
                          <RobotAvatar
                            robotId={a.avatarRobotId ?? 1}
                            displayName={a.name}
                            sizePx={20}
                            className="w-5 h-5 shrink-0"
                            alt=""
                          />
                          <span className="text-xs text-foreground truncate max-w-[120px]">
                            {a.name}
                          </span>
                          <button
                            onClick={() => removeAssignee(a.id, a.name)}
                            className="flex items-center justify-center text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-2 sm:p-0.5"
                            title="Entfernen"
                          >
                            <FiX size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <MemberPicker
                    boardId={boardId}
                    onSelect={handleAssigneeToggle}
                    selectedIds={assignees.map((a) => a.id).filter(Boolean)}
                    multiple
                  >
                    <button className="flex items-center gap-1.5 text-xs text-grey-400 dark:text-grey-300 hover:text-primary-600 bg-transparent border-none cursor-pointer transition-colors py-2 sm:py-0">
                      <FiPlus size={12} />
                      {assignees.length > 0 ? 'Person hinzufügen' : 'Person zuweisen'}
                    </button>
                  </MemberPicker>
                </div>
              </div>
            )}

            {/* Due date */}
            <div className="flex flex-row">
              <p className="w-24 shrink-0 text-sm font-medium text-grey-500 dark:text-grey-100 pt-1.5">
                <FiCalendar className="inline mr-1.5" size={13} />
                Fällig
              </p>
              <div className="flex-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      data-empty={!dueDate}
                      className="flex items-center gap-2 rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-2.5 sm:py-1.5 text-sm outline-none hover:border-primary-500 transition-colors cursor-pointer data-[empty=true]:text-grey-400 dark:data-[empty=true]:text-grey-300"
                    >
                      <FiCalendar size={13} />
                      {dueDate
                        ? new Date(dueDate).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })
                        : 'Datum wählen'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate ? new Date(dueDate) : undefined}
                      onSelect={(date) => {
                        if (!row) return;
                        const iso = date
                          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                          : '';
                        setDueDate(iso);
                        onUpdateCell(row.id, FIELD_IDS.DUE_DATE, iso || null);
                        recordActivity.mutate({
                          type: 'due_changed',
                          payload: { dueDate: iso || null },
                        });
                      }}
                    />
                    {dueDate && (
                      <div className="border-t border-grey-200 dark:border-grey-700 px-3 py-2">
                        <button
                          onClick={() => {
                            if (!row) return;
                            setDueDate('');
                            onUpdateCell(row.id, FIELD_IDS.DUE_DATE, null);
                          }}
                          className="text-xs text-red-500 hover:text-red-600 bg-transparent border-none cursor-pointer py-2 sm:py-0"
                        >
                          Datum entfernen
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                {dueDate && new Date(dueDate) < new Date(new Date().toDateString()) && (
                  <p className="text-xs text-red-500 mt-1 m-0">Überfällig</p>
                )}
              </div>
            </div>

            {/* Linked documents */}
            <div className="flex flex-row items-start">
              <p className="w-24 shrink-0 text-sm font-medium text-grey-500 dark:text-grey-100 pt-0.5">
                <FiFileText className="inline mr-1.5" size={13} />
                Dokumente
              </p>
              <div className="flex-1">
                {linkedDocs.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {linkedDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-1.5 group">
                        <a
                          href={`/docs/${doc.id}`}
                          className="text-sm text-primary-600 dark:text-primary-400 hover:underline truncate flex-1"
                        >
                          {doc.title}
                        </a>
                        <button
                          onClick={() => removeLinkedDoc(doc.id)}
                          className="sm:opacity-0 sm:group-hover:opacity-100 text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer transition-opacity text-xs p-2 sm:p-0"
                          title="Entfernen"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <CollabDocPicker onSelect={addLinkedDoc} excludeIds={linkedDocs.map((d) => d.id)}>
                  <button className="flex items-center gap-1.5 text-xs text-grey-400 dark:text-grey-300 hover:text-primary-600 bg-transparent border-none cursor-pointer transition-colors py-2 sm:py-0">
                    <FiPlus size={12} />
                    Verknüpfen
                  </button>
                </CollabDocPicker>
              </div>
            </div>

            {/* Checklists */}
            <CardChecklists
              groups={checklists}
              currentUserId={currentUserId}
              onChange={handleChecklistChange}
            />

            {/* Attachments */}
            {boardId && (
              <CardAttachments
                boardId={boardId}
                cardId={row.id}
                onCoverChange={handleCoverImageChange}
              />
            )}
          </div>

          {/* Comments */}
          {row && (
            <CardComments
              cardId={row.id}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserAvatarRobotId={currentUserAvatarRobotId}
            />
          )}

          {/* Activity timeline */}
          {boardId && <CardActivity boardId={boardId} cardId={row.id} />}
        </div>

        <div className="flex items-center justify-between border-t border-grey-200 dark:border-grey-700 px-4 py-3 sm:px-6">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-11 sm:size-8"
              onClick={handleDiscussInChat}
              title="Im Chat besprechen"
            >
              <FiMessageSquare size={15} />
            </Button>
            {boardId && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-11 sm:size-8"
                onClick={() => toggleSubscription.mutate(!isWatching)}
                title={isWatching ? 'Nicht mehr beobachten' : 'Karte beobachten'}
              >
                {isWatching ? <FiEyeOff size={15} /> : <FiEye size={15} />}
              </Button>
            )}
          </div>
          <Button size="sm" className="h-11 sm:h-8" onClick={handleSave}>
            <FiCheck className="mr-1.5" size={13} />
            Speichern
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
});
