import { useDocsAdapter } from '@gruenerator/docs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, UploadZone } from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { FiUpload } from 'react-icons/fi';

interface FileImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
} as const;

export default function FileImportDialog({ open, onOpenChange }: FileImportDialogProps) {
  const adapter = useDocsAdapter();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await adapter.fetch(`${adapter.getApiBaseUrl()}/docs/from-import`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Import fehlgeschlagen' }));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const { documentId } = (await response.json()) as { documentId: string };
        onOpenChange(false);
        adapter.navigateToDocument(documentId);
      } catch (err) {
        setError((err as Error).message);
        setIsUploading(false);
      }
    },
    [adapter, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={isUploading ? undefined : onOpenChange}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>Datei importieren</DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          <UploadZone
            accept={ACCEPTED_TYPES}
            maxSizeMB={50}
            onFileSelected={handleFileSelected}
            disabled={isUploading}
            icon={<FiUpload size={28} />}
            title={isUploading ? 'Wird verarbeitet…' : 'PDF, Word oder PowerPoint hochladen'}
            dragActiveTitle="Datei hier ablegen"
            subtitle="Drag & Drop oder klicken — max. 50 MB"
          />

          {isUploading && (
            <p className="mt-3 text-center text-xs text-grey-400">
              Die Datei wird per OCR verarbeitet — das kann einige Sekunden dauern…
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
