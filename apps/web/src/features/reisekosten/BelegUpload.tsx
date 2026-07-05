import { useRef, useState } from 'react';

import { extractBeleg } from './api';

import type { BelegTyp, ExtractBelegResponse } from '@gruenerator/contracts';

interface Props {
  belegType: BelegTyp;
  label?: string;
  onExtracted: (beleg: ExtractBelegResponse) => void;
}

/** Upload a ticket/receipt → OCR + LLM extraction → hand the parsed fields back. */
export default function BelegUpload({ belegType, label = 'Beleg hochladen', onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
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
        className="inline-flex w-fit items-center gap-sm rounded-lg border border-grey-200 bg-background px-md py-sm text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary-50 disabled:opacity-60 dark:border-grey-700 dark:hover:bg-primary-900"
      >
        {loading ? '⏳ Beleg wird ausgewertet…' : `📎 ${label}`}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
