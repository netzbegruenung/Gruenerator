import { useCreateDocument } from '@gruenerator/docs';
import { type IWorkbookData } from '@gruenerator/sheets';
import { Dialog, DialogContent, DialogHeader, DialogTitle, UploadZone } from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { FiUpload } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

interface SheetImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCEPTED_TYPES = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
} as const;

function titleFromFilename(filename: string): string {
  return (
    filename
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Importierte Tabelle'
  );
}

/**
 * Converts an uploaded .xlsx/.xls/.csv into a Univer workbook entirely in the
 * browser (LuckyExcel), then creates a fresh `sheets` doc and seeds the parsed
 * workbook through the same nav-state `sheetTemplate` path the gallery
 * templates use — the editor's collab bridge writes it to the Y.Doc on first
 * open. No server endpoint needed (unlike the OCR-based docs import).
 */
export default function SheetImportDialog({ open, onOpenChange }: SheetImportDialogProps) {
  const navigate = useNavigate();
  const createDocument = useCreateDocument();
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = useCallback(
    async (file: File) => {
      setIsImporting(true);
      setError(null);

      try {
        // Lazy-loaded: pulls exceljs/xlsx/papaparse only when a user imports.
        const LuckyExcel = (await import('@mertdeveci55/univer-import-export')).default;
        const isCsv = file.name.toLowerCase().endsWith('.csv');

        const workbook = await new Promise<IWorkbookData>((resolve, reject) => {
          const onOk = (data: IWorkbookData) => resolve(data);
          const onErr = (err: Error) => reject(err instanceof Error ? err : new Error(String(err)));
          if (isCsv) LuckyExcel.transformCsvToUniver(file, onOk, onErr);
          else LuckyExcel.transformExcelToUniver(file, onOk, onErr);
        });

        if (!workbook?.sheetOrder?.length) {
          throw new Error('Die Datei enthält keine lesbaren Tabellenblätter.');
        }

        const newDoc = await createDocument.mutateAsync({
          title: titleFromFilename(file.name),
          documentSubtype: 'sheets',
        });

        onOpenChange(false);
        // SPA navigation (not a hard redirect): the parsed workbook rides
        // `location.state` into the Univer editor, which seeds it on first open.
        // The bridge forces the workbook id to the documentId for collab.
        navigate(`/docs/${newDoc.id}`, {
          state: { sheetTemplate: workbook as Partial<IWorkbookData> },
        });
      } catch (err) {
        setError((err as Error).message || 'Import fehlgeschlagen');
        setIsImporting(false);
      }
    },
    [createDocument, navigate, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={isImporting ? undefined : onOpenChange}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>Tabelle importieren</DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          <UploadZone
            accept={ACCEPTED_TYPES}
            maxSizeMB={25}
            onFileSelected={handleFileSelected}
            disabled={isImporting}
            icon={<FiUpload size={28} />}
            title={isImporting ? 'Wird konvertiert…' : 'Excel oder CSV hochladen'}
            dragActiveTitle="Datei hier ablegen"
            subtitle="Drag & Drop oder klicken — .xlsx, .xls, .csv (max. 25 MB)"
          />

          {isImporting && (
            <p className="mt-3 text-center text-xs text-grey-400">
              Die Tabelle wird in eine bearbeitbare Grünerator-Tabelle umgewandelt…
            </p>
          )}

          {error && (
            <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
