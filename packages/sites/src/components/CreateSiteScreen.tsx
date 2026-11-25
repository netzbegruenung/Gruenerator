import { cn } from '@gruenerator/shared/utils';
import { Button } from '@gruenerator/ui';
import { useCallback, useRef, useState } from 'react';
import { FiArrowRight, FiFile, FiPaperclip, FiX } from 'react-icons/fi';

import { type HandleCheck } from '../hooks/useHandleCheck';

import { AddressField } from './editor/settings/AddressField';

interface CreateSiteScreenProps {
  subdomain: string;
  publicOrigin: string | null;
  onSubdomainChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  onGenerate: () => void;
  onFlyerUpload?: (file: File) => void;
  isProcessing: boolean;
  /** Why nothing can be created right now (the account is full); locks the composer. */
  disabledReason?: string | null;
}

// Matches validators.description in utils/validation.ts — keep in sync.
const MIN_DESCRIPTION = 50;

const PLACEHOLDER =
  'Erzähl von dir: Ich bin Maria Müller, Stadträtin in Musterstadt, und kandidiere für den Landtag. Mir sind Klimaschutz, bezahlbarer Wohnraum und gute Schulen wichtig …';

/**
 * The create composer at the top of `/sites`: address, description or flyer, generate — one
 * card, the same shell as the Projekte and Office composers. The server takes exactly one
 * source, so a chosen file replaces the description.
 */
export function CreateSiteScreen({
  subdomain,
  publicOrigin,
  onSubdomainChange,
  description,
  onDescriptionChange,
  onGenerate,
  onFlyerUpload,
  isProcessing,
  disabledReason = null,
}: CreateSiteScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [addressState, setAddressState] = useState<HandleCheck>('idle');

  const locked = isProcessing || !!disabledReason;

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onDescriptionChange(e.target.value);
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 128)}px`;
    },
    [onDescriptionChange]
  );

  const handleFileSelect = useCallback((file: File) => {
    if (file.type !== 'application/pdf') return;
    setSelectedFile(file);
  }, []);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const hasFile = !!selectedFile && !!onFlyerUpload;
  const descriptionLength = description.trim().length;
  const addressOk =
    subdomain.trim().length >= 3 &&
    addressState !== 'checking' &&
    addressState !== 'taken' &&
    addressState !== 'invalid' &&
    addressState !== 'reserved';
  const canGenerate = !locked && addressOk && (hasFile || descriptionLength >= MIN_DESCRIPTION);

  const handleGenerateClick = () => {
    if (selectedFile && onFlyerUpload) onFlyerUpload(selectedFile);
    else onGenerate();
  };

  const hint = disabledReason
    ? disabledReason
    : hasFile
      ? 'Die Seite entsteht aus deiner Datei, nicht aus der Beschreibung.'
      : descriptionLength > 0 && descriptionLength < MIN_DESCRIPTION
        ? `Noch ${MIN_DESCRIPTION - descriptionLength} Zeichen bis zur Mindestlänge.`
        : 'Nenne Namen und Rolle, 2–3 Kernthemen und deinen Wahlkreis. Oder lade einen Flyer hoch.';

  return (
    <div className="mx-auto w-full max-w-[760px]">
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- dropping a PDF is a shortcut; the attach button is the accessible way */}
      <div
        onDragOver={(e) => {
          if (locked || !onFlyerUpload) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && !locked) handleFileSelect(file);
        }}
        className={cn(
          'rounded-[24px] border bg-white shadow-[0_4px_22px_rgba(31,63,51,.07)] transition-colors dark:bg-grey-800',
          isDragging
            ? 'border-primary-500'
            : 'border-[#DFE8E2] focus-within:border-grey-400 dark:border-grey-700 dark:focus-within:border-grey-500'
        )}
      >
        <div className="border-b border-[#E7EEE9] px-4 pt-3 dark:border-grey-700 [&_p]:mt-1 [&_p]:min-h-0 [&_p:empty]:hidden">
          <AddressField
            id="subdomain"
            value={subdomain}
            onChange={onSubdomainChange}
            current={null}
            publicOrigin={publicOrigin}
            onStateChange={setAddressState}
            disabled={locked}
          />
        </div>

        <label htmlFor="description" className="sr-only">
          Beschreibung
        </label>
        <textarea
          id="description"
          value={description}
          onChange={handleTextareaChange}
          placeholder={PLACEHOLDER}
          rows={4}
          disabled={locked || hasFile}
          className="block min-h-32 w-full resize-none border-0 bg-transparent px-5 py-4 text-base text-foreground outline-none placeholder:text-muted-brand disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
          {onFlyerUpload &&
            (selectedFile ? (
              <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full bg-grey-100 py-1.5 pl-3 pr-1.5 text-sm dark:bg-grey-700">
                <FiFile aria-hidden className="size-4 shrink-0 text-grey-600 dark:text-grey-300" />
                <span className="truncate text-foreground">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  disabled={isProcessing}
                  aria-label="Datei entfernen"
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-grey-600 hover:bg-grey-200 dark:text-grey-300 dark:hover:bg-grey-600"
                >
                  <FiX aria-hidden className="size-3.5" />
                </button>
              </span>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={locked}
                  className="rounded-full text-grey-700 dark:text-grey-300"
                >
                  <FiPaperclip aria-hidden />
                  Flyer (PDF)
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                  disabled={locked}
                  aria-label="PDF-Datei auswählen"
                />
              </>
            ))}
          <Button
            type="button"
            onClick={handleGenerateClick}
            disabled={!canGenerate}
            className="ml-auto rounded-full"
          >
            {hasFile ? 'Seite aus Datei generieren' : 'Seite generieren'}
            <FiArrowRight aria-hidden />
          </Button>
        </div>
      </div>
      <p className="mt-2.5 text-center text-[13px] text-grey-600 dark:text-grey-400">{hint}</p>
    </div>
  );
}
