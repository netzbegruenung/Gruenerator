import { type FUniver } from '@gruenerator/sheets';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useMemo } from 'react';
import {
  FiArrowDown,
  FiArrowUp,
  FiCheckSquare,
  FiCrosshair,
  FiDownload,
  FiDroplet,
  FiFilter,
  FiGrid,
  FiMaximize,
  FiSearch,
  FiSliders,
} from 'react-icons/fi';
import { toast } from 'sonner';

import { downloadActiveWorkbookAsXlsx } from './exportSheetToXlsx';
import { createSheetMenuActions } from './sheetMenuActions';

interface SheetFormatMenuProps {
  univerAPI: FUniver;
  /** Document title — used as the exported filename. */
  documentTitle?: string;
}

/**
 * Compact "Format" dropdown for the sheet top bar. The Univer toolbar is off
 * (EditorTopBar owns the chrome); features that lack a native context-menu
 * entry (filter, conditional formatting, table, zen, crosshair) are reachable
 * here. Sort/data-validation/hyperlink/comment/note also stay on the native
 * right-click menu — this is additive, not their only entry point.
 */
export function SheetFormatMenu({ univerAPI, documentTitle }: SheetFormatMenuProps) {
  const actions = useMemo(() => createSheetMenuActions(univerAPI), [univerAPI]);

  const handleInsertTable = () => {
    actions
      .insertTable()
      .then((ok) => {
        if (!ok) toast.error('Tabelle konnte nicht eingefügt werden.');
      })
      .catch(() => toast.error('Tabelle konnte nicht eingefügt werden.'));
  };

  const handleExport = () => {
    downloadActiveWorkbookAsXlsx(univerAPI, documentTitle ?? 'Tabelle').catch(() =>
      toast.error('Export fehlgeschlagen.')
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="glass-btn" aria-label="Format" title="Format">
          <FiSliders />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Daten</DropdownMenuLabel>
        <DropdownMenuItem onClick={actions.toggleFilter}>
          <FiFilter className="mr-2 h-4 w-4" />
          Filter ein/aus
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.sort(true)}>
          <FiArrowUp className="mr-2 h-4 w-4" />
          Aufsteigend sortieren
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.sort(false)}>
          <FiArrowDown className="mr-2 h-4 w-4" />
          Absteigend sortieren
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.openDataValidation}>
          <FiCheckSquare className="mr-2 h-4 w-4" />
          Datenprüfung…
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Format</DropdownMenuLabel>
        <DropdownMenuItem onClick={actions.openConditionalFormatting}>
          <FiDroplet className="mr-2 h-4 w-4" />
          Bedingte Formatierung…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleInsertTable}>
          <FiGrid className="mr-2 h-4 w-4" />
          Tabelle einfügen
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Ansicht</DropdownMenuLabel>
        <DropdownMenuItem onClick={actions.openFindReplace}>
          <FiSearch className="mr-2 h-4 w-4" />
          Suchen &amp; Ersetzen
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.openZen}>
          <FiMaximize className="mr-2 h-4 w-4" />
          Zen-Modus
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.toggleCrosshair}>
          <FiCrosshair className="mr-2 h-4 w-4" />
          Fadenkreuz
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Datei</DropdownMenuLabel>
        <DropdownMenuItem onClick={handleExport}>
          <FiDownload className="mr-2 h-4 w-4" />
          Als Excel (.xlsx) herunterladen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
