import { useAgentStore } from '@gruenerator/chat';
import {
  Button,
  Calendar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
  useConfirm,
} from '@gruenerator/ui';
import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiActivity,
  FiAlignLeft,
  FiCheck,
  FiTrash2,
  FiCalendar,
  FiRepeat,
  FiTag,
  FiMessageSquare,
  FiPlus,
  FiUser,
  FiMoreHorizontal,
  FiMove,
  FiCopy,
  FiArchive,
  FiX,
  FiEye,
  FiEyeOff,
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { PhosphorIcon } from '../../agents/icons/PhosphorIcon';
import { AgentRunButton } from '../aiColumns/AgentRunButton';
import { useBoardActivity } from '../hooks/useBoardActivity';
import { useCardSubscription } from '../hooks/useCardSubscription';
import { FIELD_IDS, parseAssignees, parseChecklists, serializeAssignees } from '../types';
import { LABEL_COLORS } from '../utils/boardDefaults';
import { RECURRENCE_OPTIONS } from '../utils/recurrence';

import { CardActivity } from './CardActivity';
import { CardChecklists } from './CardChecklists';
import { CardComments } from './CardComments';
import { CardDescription } from './CardDescription';
import { CardFiles } from './CardFiles';
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary-600 text-2xl leading-none text-white shadow-sm transition-transform hover:scale-105 cursor-pointer"
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
  /** Board name — first breadcrumb segment above the card title. */
  boardTitle?: string;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatarRobotId?: number;
  onPrevCard?: () => void;
  onNextCard?: () => void;
  // Grünerator-Spalte run button is expert-only.
  expertMode?: boolean;
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
  boardTitle,
  currentUserId = '',
  currentUserName = '',
  currentUserAvatarRobotId = 1,
  onPrevCard,
  onNextCard,
  expertMode = false,
}: CardDetailPanelProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);
  const [newLabelText, setNewLabelText] = useState('');
  const [selectedLabelColor, setSelectedLabelColor] = useState(LABEL_COLORS[0]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [assignees, setAssignees] = useState<CardAssignee[]>([]);
  const [checklists, setChecklists] = useState<ChecklistGroup[]>([]);
  // Activity timeline is collapsed by default; the footer button toggles it.
  const [showActivity, setShowActivity] = useState(false);
  // Tracks which (row, open) the local form state was last synced from; see the
  // render-time sync below.
  const [syncedToken, setSyncedToken] = useState<string | null>(null);

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

  // Status column — powers the breadcrumb (current column name) and the
  // "Karte verschieben" submenu (moving = writing the STATUS cell).
  const statusField = useMemo(() => fields.find((f) => f.id === FIELD_IDS.STATUS), [fields]);
  const statusOptions = useMemo(
    () => (statusField?.typeOptions.options ?? []) as SelectOption[],
    [statusField]
  );
  const currentStatusId = row?.cells[FIELD_IDS.STATUS] as string | undefined;
  const columnName = useMemo(
    () => statusOptions.find((o) => o.id === currentStatusId)?.name,
    [statusOptions, currentStatusId]
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

  // Sync local form state from the row when the panel opens or the row changes.
  // Done during render (React's "adjusting state when a prop changes" pattern)
  // rather than in an effect, so there's no extra commit/render pass.
  const rowId = row?.id;
  const syncToken = `${rowId ?? ''}|${open ? '1' : '0'}`;
  if (row && syncToken !== syncedToken) {
    setSyncedToken(syncToken);
    setTitle((row.cells[FIELD_IDS.TITLE] as string) || '');
    setDescription((row.cells[FIELD_IDS.DESCRIPTION] as string) || '');
    setDueDate((row.cells[FIELD_IDS.DUE_DATE] as string) || '');
    setRecurrence((row.cells[FIELD_IDS.RECURRENCE] as string) || '');
    setSelectedLabelIds((row.cells[FIELD_IDS.LABELS] ?? []) as string[]);
    setShowActivity(false);
    let docs: LinkedDoc[] = [];
    try {
      const raw = row.cells[FIELD_IDS.LINKED_DOCS];
      docs = typeof raw === 'string' ? (JSON.parse(raw) as LinkedDoc[]) : [];
    } catch {
      docs = [];
    }
    setLinkedDocs(docs);
    setAssignees(parseAssignees(row.cells[FIELD_IDS.ASSIGNEE]));
    setChecklists(parseChecklists(row.cells[FIELD_IDS.CHECKLIST]));
  }

  // The title autosaves on blur; until then it can differ from the persisted
  // cell — surfaced as the "Nicht gespeichert" footer hint.
  const isDirty = row
    ? title.trim() !== ((row.cells[FIELD_IDS.TITLE] as string) || '').trim()
    : false;

  const handleTitleBlur = useCallback(() => {
    if (!row) return;
    const trimmed = title.trim();
    if (trimmed && trimmed !== row.cells[FIELD_IDS.TITLE]) {
      onUpdateCell(row.id, FIELD_IDS.TITLE, trimmed);
    }
  }, [row, title, onUpdateCell]);

  // Explicit removal — works even for labels whose board option no longer exists
  // (e.g. the option was deleted but the card still references the id).
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
      // Diff against the previous assignees. Newly-added people get a notification;
      // a newly-added bot/agent delegates the card's task to it (the worker gathers
      // the full card context). Agent ids (slugs) must NOT enter addedAssigneeIds —
      // it is cast to ::uuid[] server-side — so they ride in delegateAgentId.
      const prevIds = new Set(assignees.map((a) => a.id).filter(Boolean));
      const added = next.filter((a) => a.id && !prevIds.has(a.id) && a.id !== currentUserId);
      const addedAssigneeIds = added.filter((a) => !a.agentId).map((a) => a.id);
      const delegateAgentId = added.find((a) => a.agentId)?.agentId;
      const delegates = addedAssigneeIds.length > 0 || Boolean(delegateAgentId);
      recordActivity.mutate({
        type: 'assignees_changed',
        payload: {
          names: next.map((a) => a.name),
          ...(addedAssigneeIds.length ? { addedAssigneeIds } : {}),
          ...(delegates ? { cardTitle: title, cardDescription: description } : {}),
          ...(delegateAgentId ? { delegateAgentId } : {}),
        },
      });
    },
    [row, onUpdateCell, recordActivity, assignees, currentUserId, title, description]
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

  const handleRestore = useCallback(() => {
    if (!row) return;
    onUpdateRow(row.id, { archivedAt: undefined });
    recordActivity.mutate({ type: 'card_restored' });
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

  // "Karte verschieben" — writing the STATUS cell moves the card to that column.
  const moveToColumn = useCallback(
    (statusId: string) => {
      if (!row) return;
      onUpdateCell(row.id, FIELD_IDS.STATUS, statusId);
      recordActivity.mutate({ type: 'card_moved' });
    },
    [row, onUpdateCell, recordActivity]
  );

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

  // Cancel discards the unsaved (un-blurred) title and closes without persisting.
  const handleCancel = useCallback(() => {
    if (row) setTitle((row.cells[FIELD_IDS.TITLE] as string) || '');
    onOpenChange(false);
  }, [row, onOpenChange]);

  const handleSave = useCallback(() => {
    if (!row) return;
    onUpdateCell(row.id, FIELD_IDS.TITLE, title.trim() || (row.cells[FIELD_IDS.TITLE] as string));
    onUpdateCell(row.id, FIELD_IDS.DESCRIPTION, description);
    onUpdateCell(row.id, FIELD_IDS.DUE_DATE, dueDate || null);
    onUpdateCell(row.id, FIELD_IDS.LABELS, selectedLabelIds);
    onOpenChange(false);
  }, [row, title, description, dueDate, selectedLabelIds, onUpdateCell, onOpenChange]);

  if (!row) return null;

  const propertyRow = 'flex gap-3 px-3.5 py-2.5 min-h-[52px]';
  const propertyLabel =
    'flex items-center gap-2 w-[108px] shrink-0 text-[13px] font-semibold text-grey-500 dark:text-grey-400';
  const sectionHeading = 'flex items-center gap-2 text-[13px] font-bold text-foreground';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-[29.5rem] p-0 flex flex-col gap-0"
        showCloseButton={false}
      >
        {/* Title kept for screen readers only. */}
        <SheetTitle className="sr-only">Karte bearbeiten</SheetTitle>

        {/* ============ FIXED HEADER ============ */}
        <div className="shrink-0">
          {row.coverColor && <div className="h-2" style={{ backgroundColor: row.coverColor }} />}
          <div className="border-b border-grey-200 dark:border-grey-700 px-4 pt-4 pb-3.5 sm:px-5">
            <div className="flex items-start gap-3">
              <EmojiPicker
                value={row.icon}
                onChange={(icon) => onUpdateRow(row.id, { icon: icon || undefined })}
              />
              <div className="min-w-0 flex-1 pt-px">
                {(boardTitle || columnName) && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-grey-400">
                    {boardTitle && <span className="truncate">{boardTitle}</span>}
                    {boardTitle && columnName && <span className="opacity-50">›</span>}
                    {columnName && <span className="truncate">{columnName}</span>}
                  </div>
                )}
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
                  className="mt-0.5 w-full min-w-0 resize-none border-none bg-transparent text-xl font-bold leading-snug text-foreground-heading outline-none"
                  placeholder="Kartentitel"
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                />
              </div>
              <div className="flex items-center gap-0.5 shrink-0 -mr-1 sm:-mr-2">
                {onPrevCard && (
                  <button
                    onClick={onPrevCard}
                    className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-[10px] text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer transition-colors"
                    title="Vorherige Karte (←)"
                    aria-label="Vorherige Karte"
                  >
                    <FiChevronLeft size={18} />
                  </button>
                )}
                {onNextCard && (
                  <button
                    onClick={onNextCard}
                    className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-[10px] text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer transition-colors"
                    title="Nächste Karte (→)"
                    aria-label="Nächste Karte"
                  >
                    <FiChevronRight size={18} />
                  </button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-[10px] text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer transition-colors"
                      title="Aktionen"
                    >
                      <FiMoreHorizontal size={18} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    {/* Titelfarbe — sets/clears the card cover accent colour. */}
                    <div className="px-2 pb-1.5 pt-1.5">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-grey-400">
                        Titelfarbe
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        <button
                          onClick={() => onUpdateRow(row.id, { coverColor: undefined })}
                          className={cn(
                            'flex h-6 items-center justify-center rounded-lg border border-grey-200 dark:border-grey-600 bg-transparent text-grey-400 cursor-pointer transition-transform hover:scale-110',
                            !row.coverColor && 'ring-2 ring-primary-500'
                          )}
                          title="Keine"
                          aria-label="Keine Farbe"
                        >
                          <FiX size={13} />
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
                              'h-6 rounded-lg border-none cursor-pointer transition-transform hover:scale-110',
                              row.coverColor === color && 'ring-2 ring-primary-500'
                            )}
                            style={{ backgroundColor: color }}
                            title="Farbe setzen"
                          />
                        ))}
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    {boardId && statusOptions.length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <FiMove className="mr-2" size={13} />
                          Karte verschieben
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-48">
                          {statusOptions.map((opt) => (
                            <DropdownMenuItem
                              key={opt.id}
                              disabled={opt.id === currentStatusId}
                              onClick={() => moveToColumn(opt.id)}
                            >
                              <span
                                className="mr-2 h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: opt.color }}
                              />
                              {opt.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    {onDuplicate && (
                      <DropdownMenuItem onClick={handleDuplicate}>
                        <FiCopy className="mr-2" size={13} />
                        Duplizieren
                      </DropdownMenuItem>
                    )}
                    {row.archivedAt ? (
                      <DropdownMenuItem onClick={handleRestore}>
                        <FiArchive className="mr-2" size={13} />
                        Wiederherstellen
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={handleArchive}>
                        <FiArchive className="mr-2" size={13} />
                        Archivieren
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={async () => {
                        const docCount = linkedDocs.length;
                        const ok = await confirm(
                          docCount > 0
                            ? {
                                title: 'Aufgabe löschen?',
                                description: `Diese Aufgabe hat ${docCount} verknüpfte${
                                  docCount === 1 ? 's' : ''
                                } Dokument${
                                  docCount === 1 ? '' : 'e'
                                }. Die Dokumente bleiben erhalten – du findest sie weiterhin unter „Dokumente". Nur die Verknüpfung zur Aufgabe geht verloren.`,
                                confirmLabel: 'Trotzdem löschen',
                                alternateAction: {
                                  label: 'Archivieren',
                                  onSelect: handleArchive,
                                },
                              }
                            : {
                                title: 'Karte löschen?',
                                description:
                                  'Diese Karte und ihr gesamter Inhalt werden unwiderruflich gelöscht.',
                              }
                        );
                        if (!ok) return;
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
                  className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-[10px] text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer transition-colors"
                  title="Schließen"
                  aria-label="Schließen"
                >
                  <FiX size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ============ SCROLLABLE BODY ============ */}
        <div
          className="flex-1 overflow-y-auto flex flex-col gap-5 px-4 py-4 sm:px-5"
          style={{ paddingBottom: 'var(--mobile-keyboard-offset, 1rem)' }}
        >
          {/* Beschreibung */}
          <section className="flex flex-col gap-2">
            <div className={sectionHeading}>
              <FiAlignLeft size={16} />
              Beschreibung
            </div>
            <CardDescription
              value={description}
              onSave={(md) => {
                setDescription(md);
                if (row) onUpdateCell(row.id, FIELD_IDS.DESCRIPTION, md);
              }}
            />
          </section>

          {/* Details — Zuständig / Termin / Labels in one property block */}
          <section className="flex flex-col gap-2">
            <div className={sectionHeading}>Details</div>
            <div className="overflow-hidden rounded-xl border border-grey-200 bg-background dark:border-grey-700 divide-y divide-grey-200 dark:divide-grey-700">
              {/* Zuständig */}
              {boardId && (
                <div className={propertyRow}>
                  <div className={cn(propertyLabel, 'pt-1')}>
                    <FiUser size={16} />
                    Zuständig
                  </div>
                  <div className="flex-1">
                    {assignees.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {assignees.map((a) => (
                          <span
                            key={`${a.id}-${a.name}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-grey-100 dark:bg-grey-800 pl-1 pr-1.5 py-0.5"
                          >
                            {a.agentId ? (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-primary-600 dark:text-primary-400">
                                <PhosphorIcon name="PiSparkle" className="h-4 w-4" />
                              </span>
                            ) : (
                              <RobotAvatar
                                robotId={a.avatarRobotId ?? 1}
                                displayName={a.name}
                                sizePx={20}
                                className="w-5 h-5 shrink-0"
                                alt=""
                              />
                            )}
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
                      <button className="flex items-center gap-1.5 text-xs text-grey-400 dark:text-grey-300 hover:text-primary-600 bg-transparent border-none cursor-pointer transition-colors py-1 sm:py-0">
                        <FiPlus size={12} />
                        {assignees.length > 0 ? 'Person hinzufügen' : 'Person zuweisen'}
                      </button>
                    </MemberPicker>
                  </div>
                </div>
              )}

              {/* Termin — due date + recurrence. Recurrence lives inside the date
                  popover because it's a property of the due date: completing the card
                  spawns the next occurrence relative to it. */}
              <div className={cn(propertyRow, 'items-center')}>
                <div className={propertyLabel}>
                  <FiCalendar size={16} />
                  Termin
                </div>
                <div className="flex-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        data-empty={!dueDate}
                        className="inline-flex items-center gap-2 rounded-lg border border-grey-200 dark:border-grey-700 bg-grey-100/60 dark:bg-grey-800/60 px-2.5 py-1.5 text-[13.5px] font-semibold text-foreground outline-none hover:border-primary-500 transition-colors cursor-pointer data-[empty=true]:font-normal data-[empty=true]:text-grey-400 dark:data-[empty=true]:text-grey-300"
                      >
                        <FiCalendar size={14} />
                        <span>
                          {dueDate
                            ? new Date(dueDate).toLocaleDateString('de-DE', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                              })
                            : 'Datum wählen'}
                        </span>
                        {recurrence && (
                          <span className="flex items-center gap-1 text-grey-400 dark:text-grey-300">
                            <span className="text-grey-300 dark:text-grey-600">·</span>
                            <FiRepeat size={12} />
                            {RECURRENCE_OPTIONS.find((o) => o.id === recurrence)?.name}
                          </span>
                        )}
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
                      {/* Recurrence — when set, completing the card spawns the next occurrence */}
                      <div className="border-t border-grey-200 dark:border-grey-700 px-3 py-2.5">
                        <label className="flex items-center gap-1.5 text-xs font-medium text-grey-500 dark:text-grey-100 mb-1.5">
                          <FiRepeat size={12} />
                          Wiederholung
                        </label>
                        <select
                          value={recurrence}
                          onChange={(e) => {
                            if (!row) return;
                            const value = e.target.value;
                            setRecurrence(value);
                            onUpdateCell(row.id, FIELD_IDS.RECURRENCE, value || null);
                          }}
                          className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-2.5 sm:py-1.5 text-sm outline-none hover:border-primary-500 focus:border-primary-500 transition-colors cursor-pointer"
                        >
                          <option value="">Nicht wiederkehrend</option>
                          {RECURRENCE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                        {recurrence && (
                          <p className="text-xs text-grey-400 dark:text-grey-300 mt-1.5 m-0">
                            Beim Abschließen wird automatisch eine neue Karte mit nächstem
                            Fälligkeitsdatum erstellt.
                          </p>
                        )}
                      </div>
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

              {/* Labels */}
              <div className={propertyRow}>
                <div className={cn(propertyLabel, 'pt-1')}>
                  <FiTag size={16} />
                  Labels
                </div>
                <div className="flex-1">
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
            </div>
          </section>

          {/* Grünerator-Spalte — runs the configured Grünerator agent on this card.
              Expert-only; renders nothing unless the card's status column carries an aiTask. */}
          {expertMode && <AgentRunButton boardId={boardId} row={row} fields={fields} />}

          {/* Checklists */}
          <CardChecklists
            groups={checklists}
            currentUserId={currentUserId}
            boardId={boardId}
            onChange={handleChecklistChange}
          />

          {/* Dateien — Grünerator-Dokumente + verknüpfte Dokumente + Anhänge, vereint */}
          <CardFiles
            boardId={boardId}
            cardId={row.id}
            linkedDocs={linkedDocs}
            onAddLinkedDoc={addLinkedDoc}
            onRemoveLinkedDoc={removeLinkedDoc}
            onCoverChange={handleCoverImageChange}
          />

          {/* Comments — full-bleed: it brings its own border-t + horizontal padding */}
          <div className="-mx-4 sm:-mx-5">
            <CardComments
              cardId={row.id}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserAvatarRobotId={currentUserAvatarRobotId}
            />
          </div>

          {/* Activity timeline — toggled from the footer */}
          {boardId && showActivity && (
            <div className="-mx-4 sm:-mx-5">
              <CardActivity boardId={boardId} cardId={row.id} />
            </div>
          )}
        </div>

        {/* ============ FIXED FOOTER ============ */}
        <div className="shrink-0 flex items-center gap-1 border-t border-grey-200 dark:border-grey-700 px-3 py-2.5 sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-10 sm:size-9"
            onClick={handleDiscussInChat}
            title="Im Chat besprechen"
          >
            <FiMessageSquare size={16} />
          </Button>
          {boardId && (
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn('size-10 sm:size-9', showActivity && 'text-primary-600')}
              onClick={() => setShowActivity((v) => !v)}
              title="Aktivität"
            >
              <FiActivity size={16} />
            </Button>
          )}
          {boardId && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-10 sm:size-9"
              onClick={() => toggleSubscription.mutate(!isWatching)}
              title={isWatching ? 'Nicht mehr beobachten' : 'Karte beobachten'}
            >
              {isWatching ? <FiEyeOff size={16} /> : <FiEye size={16} />}
            </Button>
          )}
          <span className="ml-auto mr-1 text-xs text-grey-400">
            {isDirty ? 'Nicht gespeichert' : 'Gespeichert'}
          </span>
          <Button variant="ghost" size="sm" className="h-10 sm:h-9" onClick={handleCancel}>
            Abbrechen
          </Button>
          <Button size="sm" className="h-10 sm:h-9" onClick={handleSave}>
            <FiCheck className="mr-1.5" size={13} />
            Speichern
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
});
