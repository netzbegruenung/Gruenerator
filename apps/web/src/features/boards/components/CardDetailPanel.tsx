import { useAgentStore } from '@gruenerator/chat';
import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiCheck,
  FiTrash2,
  FiCalendar,
  FiTag,
  FiMessageSquare,
  FiFileText,
  FiPlus,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { FIELD_IDS } from '../types';
import { LABEL_COLORS } from '../utils/boardDefaults';

import type { Row, Field, SelectOption, CellValue, LinkedDoc } from '../types';

import { CollabDocPicker } from '@/components/common/CollabDocPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

interface CardDetailPanelProps {
  row: Row | null;
  fields: Field[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateCell: (rowId: string, fieldId: string, value: CellValue) => void;
  onUpdateRow: (rowId: string, updates: Partial<Row>) => void;
  onDelete: (rowId: string) => void;
  onUpdateField: (fieldId: string, updates: Partial<Field>) => void;
  groupId?: string;
}

export const CardDetailPanel = memo(function CardDetailPanel({
  row,
  fields,
  open,
  onOpenChange,
  onUpdateCell,
  onDelete,
  onUpdateField,
}: CardDetailPanelProps) {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);
  const [newLabelText, setNewLabelText] = useState('');
  const [selectedLabelColor, setSelectedLabelColor] = useState(LABEL_COLORS[0]);

  const labelsField = useMemo(() => fields.find((f) => f.id === FIELD_IDS.LABELS), [fields]);
  const labelOptions = useMemo(
    () => (labelsField?.typeOptions.options ?? []) as SelectOption[],
    [labelsField]
  );

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
      setLinkedDocs(typeof raw === 'string' ? JSON.parse(raw) : []);
    } catch {
      setLinkedDocs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally sync only on row change or panel open
  }, [rowId, open]);

  const handleTitleBlur = useCallback(() => {
    if (!row) return;
    const trimmed = title.trim();
    if (trimmed && trimmed !== row.cells[FIELD_IDS.TITLE]) {
      onUpdateCell(row.id, FIELD_IDS.TITLE, trimmed);
    }
  }, [row, title, onUpdateCell]);

  const handleDescriptionBlur = useCallback(() => {
    if (!row) return;
    if (description !== row.cells[FIELD_IDS.DESCRIPTION]) {
      onUpdateCell(row.id, FIELD_IDS.DESCRIPTION, description);
    }
  }, [row, description, onUpdateCell]);

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
        <div className="flex items-center justify-between border-b border-grey-200 dark:border-grey-700 px-6 py-3">
          <SheetTitle className="text-sm font-medium text-grey-500">Karte bearbeiten</SheetTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center w-7 h-7 rounded-md text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer transition-colors"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-6 pb-2">
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

          <div className="px-6 pb-6">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              rows={4}
              className="w-full rounded-lg border border-grey-200 dark:border-grey-700 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-primary-500 resize-y text-foreground placeholder:text-grey-400 leading-relaxed"
              placeholder="Beschreibung hinzufügen..."
            />
          </div>

          <div className="border-t border-grey-200 dark:border-grey-700 px-6 py-4 space-y-4">
            {/* Labels */}
            <div className="flex flex-row">
              <p className="w-24 shrink-0 text-sm font-medium text-grey-500 dark:text-grey-100 pt-1.5">
                <FiTag className="inline mr-1.5" size={13} />
                Labels
              </p>
              <div className="flex-1">
                {labelOptions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {labelOptions.map((opt) => (
                      <Badge
                        key={opt.id}
                        className="cursor-pointer text-xs"
                        style={{
                          backgroundColor: selectedLabelIds.includes(opt.id)
                            ? opt.color
                            : 'transparent',
                          color: selectedLabelIds.includes(opt.id) ? 'white' : undefined,
                        }}
                        variant={selectedLabelIds.includes(opt.id) ? 'default' : 'outline'}
                        onClick={() => toggleLabel(opt.id)}
                        title="Klicken zum Umschalten"
                      >
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
                    className="flex-1 rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary-500 placeholder:text-grey-400 dark:placeholder:text-grey-300"
                  />
                  <div className="flex gap-1">
                    {LABEL_COLORS.slice(0, 5).map((color) => (
                      <button
                        key={color}
                        onClick={() => setSelectedLabelColor(color)}
                        className="w-5 h-5 rounded-full border-none cursor-pointer transition-transform hover:scale-110"
                        style={{
                          backgroundColor: color,
                          outline: selectedLabelColor === color ? '2px solid currentColor' : 'none',
                          outlineOffset: '2px',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

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
                      className="flex items-center gap-2 rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-1.5 text-sm outline-none hover:border-primary-500 transition-colors cursor-pointer data-[empty=true]:text-grey-400 dark:data-[empty=true]:text-grey-300"
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
                          className="text-xs text-red-500 hover:text-red-600 bg-transparent border-none cursor-pointer"
                        >
                          Datum entfernen
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Linked documents */}
            <div className="flex flex-row">
              <p className="w-24 shrink-0 text-sm font-medium text-grey-500 dark:text-grey-100 pt-1.5">
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
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary-600 dark:text-primary-400 hover:underline truncate flex-1"
                        >
                          {doc.title}
                        </a>
                        <button
                          onClick={() => removeLinkedDoc(doc.id)}
                          className="opacity-0 group-hover:opacity-100 text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer transition-opacity text-xs"
                          title="Entfernen"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <CollabDocPicker onSelect={addLinkedDoc} excludeIds={linkedDocs.map((d) => d.id)}>
                  <button className="flex items-center gap-1.5 text-xs text-grey-400 dark:text-grey-300 hover:text-primary-600 bg-transparent border-none cursor-pointer transition-colors">
                    <FiPlus size={12} />
                    Verknüpfen
                  </button>
                </CollabDocPicker>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-grey-200 dark:border-grey-700 px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950 border-grey-200 dark:border-grey-700"
            onClick={() => {
              onDelete(row.id);
              onOpenChange(false);
            }}
          >
            <FiTrash2 className="mr-1.5" size={13} />
            Löschen
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDiscussInChat}>
              <FiMessageSquare className="mr-1.5" size={13} />
              Im Chat besprechen
            </Button>
            <Button size="sm" onClick={handleSave}>
              <FiCheck className="mr-1.5" size={13} />
              Speichern
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
});
