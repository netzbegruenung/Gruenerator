import { Button, Input, useConfirm } from '@gruenerator/ui';
import { memo, useCallback, useState } from 'react';
import { FiLock, FiPlus, FiTrash2 } from 'react-icons/fi';

import { LABEL_COLORS } from '../../../utils/boardDefaults';

import {
  ADDABLE_TYPES,
  HIDDEN_FIELD_IDS,
  TYPE_LABEL,
  isSystemField,
  rand,
  slug,
} from './fieldHelpers';

import type { Field, SelectOption } from '../../../types';
import type { FieldType } from '@gruenerator/contracts';

interface FieldsSectionProps {
  fields: Field[];
  addField: (field: Field) => void;
  updateField: (fieldId: string, updates: Partial<Field>) => void;
  removeField: (fieldId: string) => void;
}

/**
 * Full-width field management for the board settings overlay: add/rename/delete
 * fields and edit select options with colors. Moved out of the cramped quick
 * sidebar so option editors get real horizontal room.
 */
export const FieldsSection = memo(function FieldsSection({
  fields,
  addField,
  updateField,
  removeField,
}: FieldsSectionProps) {
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');

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

  return (
    <section className="flex w-full max-w-[42rem] flex-col gap-md">
      <div>
        <h2 className="text-base font-semibold text-foreground">Felder</h2>
        <p className="mt-0.5 text-sm text-grey-500">
          Spalten dieses Boards. Systemfelder sind gesperrt; Auswahlfelder haben benannte, farbige
          Optionen.
        </p>
      </div>

      <div className="space-y-2">
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

      <div className="flex items-center gap-2 border-t border-grey-200 pt-md dark:border-grey-700">
        <Input
          value={newFieldName}
          onChange={(e) => setNewFieldName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddField()}
          placeholder="Neues Feld…"
          className="h-9 flex-1 text-sm"
        />
        <select
          value={newFieldType}
          onChange={(e) => setNewFieldType(e.target.value as FieldType)}
          className="h-9 rounded-md border border-grey-200 bg-transparent px-2 text-sm outline-none dark:border-grey-700"
        >
          {ADDABLE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          onClick={handleAddField}
          disabled={!newFieldName.trim()}
        >
          <FiPlus size={14} className="mr-1.5" /> Hinzufügen
        </Button>
      </div>
    </section>
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
  const confirm = useConfirm();
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
    <div className="rounded-md border border-grey-200 px-3 py-2.5 dark:border-grey-700">
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
            className="flex-1 border-b border-transparent bg-transparent text-sm text-foreground outline-none focus:border-grey-300"
          />
        )}
        <span className="text-[10px] uppercase tracking-wide text-grey-400">
          {TYPE_LABEL[field.type] ?? field.type}
        </span>
        {locked ? (
          <FiLock size={12} className="text-grey-300" title="Systemfeld" />
        ) : (
          <button
            onClick={async () => {
              const ok = await confirm({
                title: 'Feld löschen?',
                description: `Das Feld „${field.name}" und alle zugehörigen Werte auf allen Karten werden gelöscht.`,
              });
              if (ok) onDelete();
            }}
            aria-label={`Feld „${field.name}" löschen`}
            className="cursor-pointer border-none bg-transparent p-0.5 text-grey-400 hover:text-red-600"
          >
            <FiTrash2 size={13} />
          </button>
        )}
      </div>

      {isSelect && !locked && (
        <div className="mt-2.5 space-y-1.5">
          {options.map((opt) => (
            <div key={opt.id} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
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
                className="flex-1 bg-transparent text-sm text-foreground outline-none"
              />
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Option löschen?',
                    description: `„${opt.name}" wird aus diesem Feld entfernt.`,
                  });
                  if (ok) onOptionsChange(options.filter((o) => o.id !== opt.id));
                }}
                aria-label="Option löschen"
                className="cursor-pointer border-none bg-transparent p-0.5 text-grey-400 hover:text-red-600"
              >
                <FiTrash2 size={12} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-grey-300" />
            <input
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addOption()}
              placeholder="Option hinzufügen…"
              className="flex-1 bg-transparent text-sm text-grey-500 outline-none"
            />
            <button
              onClick={addOption}
              aria-label="Option hinzufügen"
              className="cursor-pointer border-none bg-transparent p-0.5 text-grey-400 hover:text-foreground"
            >
              <FiPlus size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
