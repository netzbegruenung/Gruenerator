import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Switch,
} from '@gruenerator/ui';
import { memo, useCallback, useState } from 'react';
import { FiBell, FiDownload, FiPlus, FiPrinter, FiTrash2, FiLock } from 'react-icons/fi';

import { useBoardSubscription } from '../../hooks/useBoardSubscription';
import { FIELD_IDS, parseAssignees } from '../../types';
import { LABEL_COLORS } from '../../utils/boardDefaults';

import type { CellValue, Field, Row, SelectOption } from '../../types';
import type { FieldType } from '@gruenerator/contracts';

interface BoardSettingsSheetProps {
  boardId: string;
  boardTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  onSaveDescription: (value: string) => void;
  fields: Field[];
  rows: Row[];
  addField: (field: Field) => void;
  updateField: (fieldId: string, updates: Partial<Field>) => void;
  removeField: (fieldId: string) => void;
}

// Field types offered when adding a custom field (light A10 — no checklist).
const ADDABLE_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Zahl' },
  { value: 'singleSelect', label: 'Auswahl' },
  { value: 'multiSelect', label: 'Mehrfachauswahl' },
  { value: 'date', label: 'Datum' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'Link' },
];

const TYPE_LABEL: Partial<Record<FieldType, string>> = Object.fromEntries(
  ADDABLE_TYPES.map((t) => [t.value, t.label])
);

// Fields excluded from the manage-list + CSV export (internal/relational cells).
const HIDDEN_FIELD_IDS = new Set<string>([
  FIELD_IDS.COMMENTS,
  FIELD_IDS.CHECKLIST,
  FIELD_IDS.LINKED_DOCS,
]);

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 24) || 'feld'
  );
}
function rand(): string {
  return Math.random().toString(36).slice(2, 7);
}

function isSystemField(field: Field): boolean {
  return field.typeOptions.isSystem === true;
}

function cellToText(field: Field, value: CellValue): string {
  if (value == null || value === '') return '';
  if (field.id === FIELD_IDS.ASSIGNEE) {
    return parseAssignees(value)
      .map((a) => a.name)
      .join(', ');
  }
  if (field.type === 'singleSelect') {
    const options = (field.typeOptions.options as SelectOption[] | undefined) ?? [];
    return options.find((o) => o.id === value)?.name ?? String(value);
  }
  if (field.type === 'multiSelect') {
    const options = (field.typeOptions.options as SelectOption[] | undefined) ?? [];
    const ids = Array.isArray(value) ? value : [];
    return ids.map((id) => options.find((o) => o.id === id)?.name ?? id).join('; ');
  }
  if (field.type === 'checkbox') return value ? 'Ja' : 'Nein';
  return String(value);
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const BoardSettingsSheet = memo(function BoardSettingsSheet({
  boardId,
  boardTitle,
  open,
  onOpenChange,
  description,
  onSaveDescription,
  fields,
  rows,
  addField,
  updateField,
  removeField,
}: BoardSettingsSheetProps) {
  const { subscriptionQuery, toggle } = useBoardSubscription(boardId);
  const watching = subscriptionQuery.data?.subscribed ?? false;

  const [desc, setDesc] = useState(description);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');

  const exportableFields = fields.filter((f) => !HIDDEN_FIELD_IDS.has(f.id));

  const handleAddField = useCallback(() => {
    const name = newFieldName.trim();
    if (!name) return;
    const isSelect = newFieldType === 'singleSelect' || newFieldType === 'multiSelect';
    const maxOrder = fields.reduce((m, f) => Math.max(m, f.order), 0);
    addField({
      id: `field-${slug(name)}-${rand()}`,
      name,
      type: newFieldType,
      typeOptions: isSelect ? { options: [] } : {},
      order: maxOrder + 1,
    });
    setNewFieldName('');
    setNewFieldType('text');
  }, [newFieldName, newFieldType, fields, addField]);

  const handleOptionChange = useCallback(
    (field: Field, nextOptions: SelectOption[]) => {
      updateField(field.id, { typeOptions: { ...field.typeOptions, options: nextOptions } });
    },
    [updateField]
  );

  const handleExportCsv = useCallback(() => {
    const header = exportableFields.map((f) => csvEscape(f.name)).join(',');
    const lines = rows.map((row) =>
      exportableFields.map((f) => csvEscape(cellToText(f, row.cells[f.id] ?? null))).join(',')
    );
    const csv = [header, ...lines].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(boardTitle) || 'board'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportableFields, rows, boardTitle]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[26rem] flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Board-Einstellungen</SheetTitle>
        </SheetHeader>

        <div className="mt-3 space-y-6">
          {/* Beschreibung (A3) */}
          <section>
            <label className="text-sm font-medium text-foreground">Beschreibung</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={() => {
                if (desc !== description) onSaveDescription(desc);
              }}
              placeholder="Worum geht es in diesem Board? (Markdown)"
              rows={4}
              className="mt-1.5 w-full resize-y rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary-500"
            />
          </section>

          {/* Board beobachten (A9) */}
          <section className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiBell size={15} className="text-grey-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Board beobachten</p>
                <p className="text-xs text-grey-400">Bei Änderungen am Board benachrichtigt werden</p>
              </div>
            </div>
            <Switch
              checked={watching}
              onCheckedChange={(v) => toggle.mutate(v)}
              disabled={toggle.isPending || subscriptionQuery.isLoading}
              aria-label="Board beobachten"
            />
          </section>

          {/* Felder verwalten (A10) */}
          <section>
            <p className="text-sm font-medium text-foreground mb-2">Felder</p>
            <div className="space-y-1.5">
              {fields
                .filter((f) => !HIDDEN_FIELD_IDS.has(f.id))
                .map((field) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    locked={isSystemField(field)}
                    onRename={(name) => updateField(field.id, { name })}
                    onDelete={() => removeField(field.id)}
                    onOptionsChange={(opts) => handleOptionChange(field, opts)}
                  />
                ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddField()}
                placeholder="Neues Feld…"
                className="h-8 flex-1 text-sm"
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as FieldType)}
                className="h-8 rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 text-xs outline-none"
              >
                {ADDABLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={handleAddField} disabled={!newFieldName.trim()}>
                <FiPlus size={14} />
              </Button>
            </div>
          </section>

          {/* Export / Druck (A11) */}
          <section>
            <p className="text-sm font-medium text-foreground mb-2">Export</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleExportCsv} className="flex-1">
                <FiDownload size={14} className="mr-1.5" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()} className="flex-1">
                <FiPrinter size={14} className="mr-1.5" /> Drucken
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-grey-400">
              {rows.length} {rows.length === 1 ? 'Karte' : 'Karten'} (aktuelle Ansicht)
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
});

// ---------------------------------------------------------------------------

interface FieldRowProps {
  field: Field;
  locked: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onOptionsChange: (options: SelectOption[]) => void;
}

const FieldRow = memo(function FieldRow({
  field,
  locked,
  onRename,
  onDelete,
  onOptionsChange,
}: FieldRowProps) {
  const isSelect = field.type === 'singleSelect' || field.type === 'multiSelect';
  const options = (field.typeOptions.options as SelectOption[] | undefined) ?? [];
  const [newOption, setNewOption] = useState('');

  const addOption = () => {
    const name = newOption.trim();
    if (!name) return;
    onOptionsChange([
      ...options,
      {
        id: `opt-${slug(name)}-${rand()}`,
        name,
        color: LABEL_COLORS[options.length % LABEL_COLORS.length] ?? '#7c9885',
      },
    ]);
    setNewOption('');
  };

  return (
    <div className="rounded-md border border-grey-200 dark:border-grey-700 px-2.5 py-2">
      <div className="flex items-center gap-2">
        {locked ? (
          <span className="flex-1 text-sm text-foreground">{field.name}</span>
        ) : (
          <input
            defaultValue={field.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== field.name) onRename(v);
            }}
            className="flex-1 bg-transparent text-sm text-foreground outline-none border-b border-transparent focus:border-grey-300"
          />
        )}
        <span className="text-[10px] uppercase tracking-wide text-grey-400">
          {TYPE_LABEL[field.type] ?? field.type}
        </span>
        {locked ? (
          <FiLock size={12} className="text-grey-300" title="Systemfeld" />
        ) : (
          <button
            onClick={onDelete}
            aria-label={`Feld „${field.name}" löschen`}
            className="text-grey-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"
          >
            <FiTrash2 size={13} />
          </button>
        )}
      </div>

      {isSelect && !locked && (
        <div className="mt-2 space-y-1">
          {options.map((opt) => (
            <div key={opt.id} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: opt.color }}
              />
              <input
                defaultValue={opt.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== opt.name) {
                    onOptionsChange(options.map((o) => (o.id === opt.id ? { ...o, name: v } : o)));
                  }
                }}
                className="flex-1 bg-transparent text-xs text-foreground outline-none"
              />
              <button
                onClick={() => onOptionsChange(options.filter((o) => o.id !== opt.id))}
                aria-label="Option löschen"
                className="text-grey-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"
              >
                <FiTrash2 size={11} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <input
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addOption()}
              placeholder="Option hinzufügen…"
              className="flex-1 bg-transparent text-xs text-grey-500 outline-none"
            />
            <button
              onClick={addOption}
              aria-label="Option hinzufügen"
              className="text-grey-400 hover:text-foreground bg-transparent border-none cursor-pointer p-0.5"
            >
              <FiPlus size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
