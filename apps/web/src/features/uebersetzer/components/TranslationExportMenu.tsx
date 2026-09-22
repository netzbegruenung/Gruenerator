import {
  Button,
  DropdownMenuItem,
  ResponsiveMenu,
  ResponsiveMenuItem,
  toast,
} from '@gruenerator/ui';
import { useCallback, useState, type ReactNode } from 'react';
import { PiFileArrowDown, PiFileDoc, PiFilePdf, PiNotePencil } from 'react-icons/pi';

import { useContentActions } from '@/hooks/useContentActions';
import { useExportStore } from '@/stores/core/exportStore';

interface TranslationExportMenuProps {
  /** The translation itself. Empty means there is nothing to export yet. */
  text: string;
  /** Resolved plain name of the source language, e.g. "Deutsch". */
  sourceName: string;
  /** Resolved plain name of the target language, e.g. "Englisch (britisch)". */
  targetName: string;
}

interface ExportAction {
  id: 'docs' | 'docx' | 'pdf';
  label: string;
  icon: ReactNode;
}

const ACTIONS: ExportAction[] = [
  { id: 'docs', label: 'Im Editor bearbeiten', icon: <PiNotePencil aria-hidden="true" /> },
  { id: 'docx', label: 'Als Word (.docx)', icon: <PiFileDoc aria-hidden="true" /> },
  { id: 'pdf', label: 'Als PDF', icon: <PiFilePdf aria-hidden="true" /> },
];

/**
 * The translation as a document: opened in the editor, or downloaded as Word
 * or PDF. All three ride on paths that already exist — `useContentActions` for
 * the editor, the export store for the two files — so the Grünen branding
 * (Sonnenblume, fonts, colours) comes from the server renderers untouched.
 *
 * Only the translation goes into the document, not the source text: this is
 * the text people take somewhere else, and the original is the one thing they
 * already have.
 */
export function TranslationExportMenu({
  text,
  sourceName,
  targetName,
}: TranslationExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportAction['id'] | null>(null);
  const generateDOCX = useExportStore((s) => s.generateDOCX);
  const generatePDF = useExportStore((s) => s.generatePDF);

  const getContent = useCallback(() => text, [text]);
  const getTitle = useCallback(
    () => `Übersetzung: ${sourceName} → ${targetName}`,
    [sourceName, targetName]
  );
  // 'notizen' is the prose subtype of COLLAB_SUBTYPE_VALUES — the server
  // silently downgrades anything it does not know to 'blank', so a wrong value
  // here would never show up as an error, only as a mislabelled document.
  const getDocumentType = useCallback(() => 'notizen' as const, []);
  const { handleOpenInDocs } = useContentActions({ getContent, getTitle, getDocumentType });

  const download = async (id: 'docx' | 'pdf') => {
    const word = id === 'docx';
    const pending = toast.loading(word ? 'Word-Datei wird erstellt …' : 'PDF wird erstellt …');
    try {
      if (word) await generateDOCX(text, getTitle());
      else await generatePDF(text, getTitle());
      toast.success(word ? 'Word-Datei erstellt' : 'PDF erstellt', { id: pending });
    } catch (error) {
      // The server explains a refusal in its own words; "HTTP 500" would hide
      // the one thing the user could act on.
      toast.error(error instanceof Error ? error.message : 'Export fehlgeschlagen', {
        id: pending,
      });
    }
  };

  /**
   * One at a time. Each of the three leaves the page (a download, a new tab),
   * so a second one started underneath the first would land on top of it with
   * no way to tell which won.
   */
  const run = (id: ExportAction['id']) => {
    if (busy) return;
    setOpen(false);
    setBusy(id);
    void (id === 'docs' ? handleOpenInDocs() : download(id)).finally(() => setBusy(null));
  };

  return (
    <ResponsiveMenu
      open={open}
      onOpenChange={setOpen}
      dropdownSide="top"
      dropdownAlign="end"
      sheetTitle="Als Dokument"
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full text-primary-600 hover:bg-primary-100 dark:text-primary-300 dark:hover:bg-primary-900"
          disabled={!text || busy !== null}
        >
          <PiFileArrowDown aria-hidden="true" />
          Als Dokument
        </Button>
      }
      desktopContent={ACTIONS.map((action) => (
        <DropdownMenuItem key={action.id} disabled={busy !== null} onSelect={() => run(action.id)}>
          {action.icon}
          {action.label}
        </DropdownMenuItem>
      ))}
      mobileContent={ACTIONS.map((action) => (
        <ResponsiveMenuItem
          key={action.id}
          icon={action.icon}
          disabled={busy !== null}
          onClick={() => run(action.id)}
        >
          {action.label}
        </ResponsiveMenuItem>
      ))}
    />
  );
}
