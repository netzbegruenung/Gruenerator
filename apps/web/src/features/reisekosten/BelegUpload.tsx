import { useRef, useState } from 'react';

import { extractBeleg } from './api';

import type { BelegTyp, ExtractBelegResponse } from '@gruenerator/contracts';

interface Props {
  belegType: BelegTyp;
  title?: string;
  subtitle?: string;
  onExtracted: (beleg: ExtractBelegResponse) => void;
}

/** Upload a ticket/receipt → OCR + LLM extraction → hand the parsed fields back. */
export default function BelegUpload({
  belegType,
  title = 'Beleg hier ablegen oder auswählen',
  subtitle = 'PDF oder Foto – wird automatisch ausgewertet',
  onExtracted,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const beleg = await extractBeleg(file, belegType);
      onExtracted(beleg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Auswerten');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-xs">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex w-full flex-col items-center justify-center gap-xs rounded-md border-2 border-dashed px-md py-lg text-center transition-colors disabled:opacity-70 ${
          dragActive
            ? 'border-primary bg-primary-50 dark:bg-primary-900'
            : 'border-border bg-background-alt hover:border-primary hover:bg-primary-50 dark:hover:bg-primary-900'
        }`}
      >
        {loading ? (
          <span className="text-sm font-medium text-foreground">⏳ Beleg wird ausgewertet…</span>
        ) : (
          <>
            <span className="text-2xl leading-none">📎</span>
            <span className="text-sm font-semibold text-foreground">
              {dragActive ? 'Beleg hier loslassen' : title}
            </span>
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          </>
        )}
      </button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
