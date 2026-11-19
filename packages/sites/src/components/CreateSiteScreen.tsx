import { cn } from '@gruenerator/shared/utils';
import { Button, Label, Textarea } from '@gruenerator/ui';
import { useCallback, useRef, useState } from 'react';
import { FiArrowLeft, FiArrowRight, FiFile, FiUpload, FiX } from 'react-icons/fi';

import { type HandleCheck } from '../hooks/useHandleCheck';
import { formatAddress } from '../utils/siteAddress';

import { BackButton } from './common/BackButton';
import { AddressField } from './editor/settings/AddressField';

interface CreateSiteScreenProps {
  subdomain: string;
  publicOrigin: string | null;
  onSubdomainChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  onGenerate: () => void;
  onFlyerUpload?: (file: File) => void;
  onBack?: () => void;
  isProcessing: boolean;
  isGenerating: boolean;
  isGeneratingFromFlyer?: boolean;
}

// Matches validators.description in utils/validation.ts — keep in sync.
const MIN_DESCRIPTION = 50;

export function CreateSiteScreen({
  subdomain,
  publicOrigin,
  onSubdomainChange,
  description,
  onDescriptionChange,
  onGenerate,
  onFlyerUpload,
  onBack,
  isProcessing,
  isGenerating,
  isGeneratingFromFlyer,
}: CreateSiteScreenProps) {
  const [step, setStep] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onDescriptionChange(e.target.value);
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 240)}px`;
    },
    [onDescriptionChange]
  );

  const handleFileSelect = useCallback((file: File) => {
    if (file.type !== 'application/pdf') return;
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleGenerateClick = useCallback(() => {
    // The server takes exactly one source: a chosen file replaces the description.
    if (selectedFile && onFlyerUpload) {
      onFlyerUpload(selectedFile);
    } else {
      onGenerate();
    }
  }, [selectedFile, onFlyerUpload, onGenerate]);

  const [addressState, setAddressState] = useState<HandleCheck>('idle');
  const canProceed =
    subdomain.trim().length >= 3 &&
    addressState !== 'checking' &&
    addressState !== 'taken' &&
    addressState !== 'invalid' &&
    addressState !== 'reserved';
  const descriptionLength = description.trim().length;
  const hasFile = !!selectedFile && !!onFlyerUpload;
  const canGenerate = hasFile || descriptionLength >= MIN_DESCRIPTION;

  // Two-step flow: 0 = address, 1 = content (type or upload).
  const totalSteps = 2;

  return (
    <div className="relative flex min-h-full items-center justify-center px-md py-xl lg:px-xl">
      {onBack && step === 0 && (
        <div className="absolute top-3 left-3 z-10">
          <BackButton onBack={onBack} />
        </div>
      )}

      {/* Step indicator */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-10">
        {Array.from({ length: totalSteps }, (_, i) => {
          const dotClassName = cn(
            'h-1.5 rounded-full transition-all duration-300',
            step === i ? 'w-10 bg-primary-600' : 'w-3 bg-primary-200'
          );
          return i < step ? (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              disabled={isProcessing}
              className={cn(dotClassName, 'border-none p-0 cursor-pointer hover:bg-primary-300')}
              aria-label={`Zu Schritt ${i + 1} zurückgehen`}
            />
          ) : (
            <span key={i} className={dotClassName} aria-label={`Schritt ${i + 1}`} />
          );
        })}
      </div>

      {/* Step 0: Address — the welcoming opening */}
      {step === 0 && (
        <div
          key="step-address"
          className="relative z-10 w-full max-w-[640px] lg:max-w-[720px] mx-auto text-center animate-[step-enter_0.4s_ease-out]"
        >
          <h1 className="font-semibold text-[length:var(--font-size-3xl)] lg:text-[length:var(--font-size-4xl)] text-primary-800 dark:text-primary-300 mb-4">
            Deine Kandidat*innen-Seite
          </h1>
          <p className="text-[length:var(--font-size-lg)] text-grey-500 dark:text-grey-400 leading-relaxed mb-12 max-w-[500px] mx-auto">
            Wähle die Adresse für deine neue Website.
          </p>

          <div className="max-w-[560px] lg:max-w-[600px] mx-auto">
            <div className="text-left">
              <AddressField
                id="subdomain"
                value={subdomain}
                onChange={onSubdomainChange}
                current={null}
                publicOrigin={publicOrigin}
                onEnter={() => canProceed && setStep(1)}
                onStateChange={setAddressState}
                disabled={isProcessing}
                autoFocus
                large
              />
            </div>
            <p className="text-sm text-grey-400 dark:text-grey-500 mt-1">
              Kleinbuchstaben, Zahlen und Bindestriche · 3–30 Zeichen
            </p>
          </div>

          <div className="mt-12">
            <Button size="lg" onClick={() => setStep(1)} disabled={!canProceed}>
              Weiter
              <FiArrowRight className="size-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 1: Choose how to fill the page — type or upload a flyer */}
      {step === 1 && (
        <div
          key="step-content"
          className="relative z-10 w-full max-w-[640px] lg:max-w-[720px] mx-auto animate-[step-enter_0.4s_ease-out]"
        >
          {/* Back + address */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setStep(0)}
              disabled={isProcessing}
              className="inline-flex items-center gap-1.5 text-sm text-grey-500 dark:text-grey-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors bg-transparent border-none cursor-pointer p-0"
            >
              <FiArrowLeft className="size-4" />
              Zurück
            </button>
            <span className="text-sm text-grey-500 dark:text-grey-400">
              {formatAddress(publicOrigin, subdomain)}
            </span>
          </div>

          <div className="text-center mb-8">
            <h2 className="font-semibold text-[length:var(--font-size-2xl)] lg:text-[length:var(--font-size-3xl)] text-foreground mb-2">
              Erzähl uns von dir
            </h2>
            <p className="text-[length:var(--font-size-base)] lg:text-[length:var(--font-size-lg)] text-grey-500 dark:text-grey-400 leading-relaxed">
              Die KI erstellt daraus deine professionelle Website.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-base">
              Beschreibung
            </Label>
            <Textarea
              ref={textareaRef}
              id="description"
              value={description}
              onChange={handleTextareaChange}
              placeholder={
                'Ich bin Maria Müller, 42 Jahre alt, Stadträtin in Musterstadt.\n\nIch kandidiere für den Landtag und setze mich besonders für Klimaschutz, bezahlbaren Wohnraum und bessere Bildung ein...\n\nIn meiner Freizeit engagiere ich mich im lokalen Umweltschutzverein und bin Mutter von zwei Kindern.'
              }
              rows={10}
              disabled={isProcessing || hasFile}
              autoFocus
              className="min-h-[240px] lg:min-h-[280px] resize-y text-base"
            />
            {hasFile ? (
              <p className="text-sm text-grey-500 dark:text-grey-400">
                Die Seite entsteht aus deiner Datei, nicht aus der Beschreibung. Entferne die Datei,
                um selbst zu schreiben.
              </p>
            ) : descriptionLength > 0 && descriptionLength < MIN_DESCRIPTION ? (
              <p className="text-sm text-grey-400 dark:text-grey-500">
                Noch {MIN_DESCRIPTION - descriptionLength} Zeichen bis zur Mindestlänge.
              </p>
            ) : (
              <p className="text-sm text-grey-400 dark:text-grey-500">
                Tipp: Nenne Namen &amp; Rolle, 2–3 Kernthemen und deinen Wahlkreis – je mehr
                Details, desto besser.
              </p>
            )}
          </div>

          {onFlyerUpload && (
            <div className="mt-6">
              <p className="mb-2 text-base font-medium text-foreground">oder Datei hochladen</p>
              {selectedFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-900 p-4">
                  <FiFile className="size-8 text-grey-500 dark:text-grey-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-grey-500 dark:text-grey-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    disabled={isProcessing}
                    className="shrink-0 p-1.5 rounded-md text-grey-400 dark:text-grey-500 hover:text-grey-600 dark:hover:text-grey-400 hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors bg-transparent border-none cursor-pointer"
                    aria-label="Datei entfernen"
                  >
                    <FiX className="size-4" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => !isProcessing && fileInputRef.current?.click()}
                    className={cn(
                      'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-transparent p-6 cursor-pointer transition-all',
                      isDragging
                        ? 'border-primary-500 bg-primary-50/50'
                        : 'border-grey-300 dark:border-grey-700 hover:border-primary-400 hover:bg-primary-50/30'
                    )}
                  >
                    <FiUpload className="size-6 text-grey-400 dark:text-grey-500" />
                    <span className="text-sm text-grey-600 dark:text-grey-400 text-center">
                      <span className="font-medium text-primary-600 dark:text-primary-400">
                        Datei auswählen
                      </span>{' '}
                      oder hierher ziehen
                    </span>
                    <span className="text-xs text-grey-400 dark:text-grey-500">
                      PDF, max. 20 MB, bis 100 Seiten
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    disabled={isProcessing}
                    aria-label="PDF-Datei auswählen"
                  />
                </>
              )}
            </div>
          )}

          {/* Generate */}
          <div className="mt-8 flex justify-end">
            <Button size="lg" onClick={handleGenerateClick} disabled={isProcessing || !canGenerate}>
              {isProcessing ? (
                <>
                  <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-[spin_1s_linear_infinite]" />
                  {isGenerating || isGeneratingFromFlyer ? 'KI generiert...' : 'Wird erstellt...'}
                </>
              ) : (
                <>
                  {hasFile ? 'Seite aus Datei generieren' : 'Seite generieren'}
                  <FiArrowRight className="size-5" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
