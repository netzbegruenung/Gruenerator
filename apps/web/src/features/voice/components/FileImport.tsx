import { Button, toast } from '@gruenerator/ui';
import { FileText, LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';

import { prepareExtractedText } from '../fileText';

import { extractTextFromFile } from '@/utils/scannerExtract';

/**
 * PDF and Word only. The route behind `extractTextFromFile` also reads images
 * and slides, but neither is where a Vorlesefassung comes from, and it does not
 * accept ODT at all (`ALLOWED_EXTENSIONS` in routes/scanner).
 */
const ACCEPT = '.pdf,.docx';

export interface FileImportProps {
  /** Receives the cleaned text and the file's name, for messages about it. */
  onText: (text: string, fileName: string) => void;
}

/**
 * "Datei einfügen": reads an Antrag or a Pressemitteilung that already exists
 * as a file into the editor, through the same extraction the Scanner uses.
 */
const FileImport = ({ onText }: FileImportProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = prepareExtractedText(await extractTextFromFile(file));
      if (text === '') {
        toast.error(`In „${file.name}" wurde kein Text gefunden.`);
        return;
      }
      onText(text, file.name);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : `„${file.name}" konnte nicht gelesen werden.`
      );
    } finally {
      setBusy(false);
      // Choosing the same file again must fire `change` again.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void read(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <FileText aria-hidden="true" />
        )}
        <span className="max-sm:sr-only">{busy ? 'Datei wird gelesen …' : 'Datei einfügen'}</span>
      </Button>
    </>
  );
};

export default FileImport;
