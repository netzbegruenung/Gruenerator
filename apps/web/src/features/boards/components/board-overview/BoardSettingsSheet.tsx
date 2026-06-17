import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, Switch } from '@gruenerator/ui';
import { memo, useCallback, useState } from 'react';
import { FiBell, FiDownload, FiPrinter, FiSettings } from 'react-icons/fi';

import { useBoardSubscription } from '../../hooks/useBoardSubscription';
import { FIELD_IDS, parseAssignees } from '../../types';

import { HIDDEN_FIELD_IDS, slug } from './settings/fieldHelpers';

import type { CellValue, Field, Row, SelectOption } from '../../types';

interface BoardSettingsSheetProps {
  boardTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  onSaveDescription: (value: string) => void;
  boardId: string;
  fields: Field[];
  rows: Row[];
  onOpenFullSettings: () => void;
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

/**
 * Quick board settings — the frequent, in-context tweaks (Beschreibung,
 * Beobachten, Export). Deeper configuration (Felder, Ansichten, Teilen,
 * Gefahrenzone) lives in the full-screen settings overlay, opened from here.
 */
export const BoardSettingsSheet = memo(function BoardSettingsSheet({
  boardTitle,
  open,
  onOpenChange,
  description,
  onSaveDescription,
  boardId,
  fields,
  rows,
  onOpenFullSettings,
}: BoardSettingsSheetProps) {
  const { subscriptionQuery, toggle } = useBoardSubscription(boardId);
  const watching = subscriptionQuery.data?.subscribed ?? false;

  const [desc, setDesc] = useState(description);

  const exportableFields = fields.filter((f) => !HIDDEN_FIELD_IDS.has(f.id));

  const handleExportCsv = useCallback(() => {
    const header = exportableFields.map((f) => csvEscape(f.name)).join(',');
    const lines = rows.map((row) =>
      exportableFields.map((f) => csvEscape(cellToText(f, row.cells[f.id] ?? null))).join(',')
    );
    const csv = [header, ...lines].join('\r\n');
    // Prepend a UTF-8 BOM (U+FEFF) so Excel reads the file as UTF-8.
    const bom = String.fromCharCode(0xfeff);
    const blob = new Blob([`${bom}${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(boardTitle) || 'board'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportableFields, rows, boardTitle]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col overflow-y-auto sm:max-w-[24rem]">
        <SheetHeader>
          <SheetTitle className="text-base">Einstellungen</SheetTitle>
        </SheetHeader>

        <div className="mt-3 space-y-6">
          {/* Beschreibung */}
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
              className="mt-1.5 w-full resize-y rounded-md border border-grey-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-grey-700"
            />
          </section>

          {/* Board beobachten */}
          <section className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiBell size={15} className="text-grey-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Board beobachten</p>
                <p className="text-xs text-grey-400">
                  Bei Änderungen am Board benachrichtigt werden
                </p>
              </div>
            </div>
            <Switch
              checked={watching}
              onCheckedChange={(v) => toggle.mutate(v)}
              disabled={toggle.isPending || subscriptionQuery.isLoading}
              aria-label="Board beobachten"
            />
          </section>

          {/* Export / Druck */}
          <section>
            <p className="mb-2 text-sm font-medium text-foreground">Export</p>
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

          {/* Full settings */}
          <section className="border-t border-grey-200 pt-4 dark:border-grey-700">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                onOpenChange(false);
                onOpenFullSettings();
              }}
            >
              <FiSettings size={15} className="mr-2" /> Alle Einstellungen
            </Button>
            <p className="mt-1.5 text-xs text-grey-400">
              Felder, Ansichten, Teilen, Archivieren &amp; Löschen
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
});
