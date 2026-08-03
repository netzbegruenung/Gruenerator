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
import { FiCrosshair, FiDownload, FiMaximize, FiMoreHorizontal } from 'react-icons/fi';
import { toast } from 'sonner';

import { downloadActiveWorkbookAsXlsx } from './exportSheetToXlsx';
import { createSheetMenuActions } from './sheetMenuActions';

interface SheetFormatMenuProps {
  univerAPI: FUniver;
  /** Document title — used as the exported filename. */
  documentTitle?: string;
}

/**
 * The few sheet actions Univer's own ribbon does NOT surface.
 *
 * Everything else this menu used to carry — filter, sort, data validation,
 * conditional formatting, insert table, find & replace — now lives in the
 * native ribbon's "Daten" tab, so duplicating it here would only be a second,
 * worse entry point. What is left has no ribbon entry: the zen editor is
 * context-menu-only, the crosshair sits in the footer menu (which we hide), and
 * the .xlsx export is ours (Univer Pro's exchange client is not licensed).
 */
export function SheetFormatMenu({ univerAPI, documentTitle }: SheetFormatMenuProps) {
  const actions = useMemo(() => createSheetMenuActions(univerAPI), [univerAPI]);

  const handleExport = () => {
    downloadActiveWorkbookAsXlsx(univerAPI, documentTitle ?? 'Tabelle').catch(() =>
      toast.error('Export fehlgeschlagen.')
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="glass-btn" aria-label="Weitere Aktionen" title="Weitere Aktionen">
          <FiMoreHorizontal />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Ansicht</DropdownMenuLabel>
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
