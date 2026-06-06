import { Button, Label, Textarea, ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';
import { useCallback, useRef, useState } from 'react';
import { FiArrowLeft, FiArrowRight, FiFile, FiUpload, FiX } from 'react-icons/fi';

import { cn } from '../utils/cn';

interface CreateSiteScreenProps {
  subdomain: string;
  onSubdomainChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  onGenerate: () => void;
  onFlyerUpload?: (file: File) => void;
  isProcessing: boolean;
  isGenerating: boolean;
  isGeneratingFromFlyer?: boolean;
}

type InputMode = 'text' | 'flyer';

// Matches validators.description in utils/validation.ts — keep in sync.
const MIN_DESCRIPTION = 50;

export function CreateSiteScreen({
  subdomain,
  onSubdomainChange,
  description,
  onDescriptionChange,
  onGenerate,
  onFlyerUpload,
  isProcessing,
  isGenerating,
  isGeneratingFromFlyer,
}: CreateSiteScreenProps) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<InputMode>('text');
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
    if (mode === 'flyer' && selectedFile && onFlyerUpload) {
      onFlyerUpload(selectedFile);
    } else {
      onGenerate();
    }
  }, [mode, selectedFile, onFlyerUpload, onGenerate]);

  const canProceed = subdomain.trim().length >= 3;
  const descriptionLength = description.trim().length;
  const canGenerate =
    mode === 'flyer' ? !!selectedFile && !!onFlyerUpload : descriptionLength >= MIN_DESCRIPTION;

  // Two-step flow: 0 = address, 1 = content (type or upload).
  const totalSteps = 2;

  return (
    <div className="relative flex min-h-full items-center justify-center px-md py-xl lg:px-xl">
      {/* Step indicator */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-10">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              step === i ? 'w-10 bg-primary-600' : 'w-3 bg-primary-200',
              i < step && !isProcessing && 'cursor-pointer hover:bg-primary-300'
            )}
            onClick={() => i < step && !isProcessing && setStep(i)}
            role={i < step ? 'button' : undefined}
            aria-label={`Schritt ${i + 1}`}
          />
        ))}
      </div>

      {/* Step 0: Address — the welcoming opening */}
      {step === 0 && (
        <div
          key="step-address"
          className="relative z-10 w-full max-w-[640px] lg:max-w-[720px] mx-auto text-center animate-[step-enter_0.4s_ease-out]"
        >
          <h1 className="font-[GrueneTypeNeue] text-[length:var(--font-size-3xl)] lg:text-[length:var(--font-size-4xl)] text-primary-800 dark:text-primary-300 mb-4">
            Deine Kandidat*innen-Seite
          </h1>
          <p className="text-[length:var(--font-size-lg)] text-grey-500 dark:text-grey-400 leading-relaxed mb-12 max-w-[500px] mx-auto">
            Wähle die Adresse für deine neue Website.
          </p>

          <div className="max-w-[560px] lg:max-w-[600px] mx-auto">
            <Label htmlFor="subdomain" className="sr-only">
              Adresse
            </Label>
            <div className="flex items-center rounded-lg border border-grey-200 dark:border-grey-700 bg-card transition-all focus-within:border-primary-500 focus-within:ring-[3px] focus-within:ring-ring/50">
              <span className="shrink-0 pl-5 pr-1 text-xl text-grey-300 dark:text-grey-600 select-none hidden sm:inline">
                https://
              </span>
              <input
                id="subdomain"
                type="text"
                value={subdomain}
                onChange={(e) => onSubdomainChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canProceed && setStep(1)}
                placeholder="dein-name"
                disabled={isProcessing}
                autoFocus
                className="flex-1 h-16 lg:h-[72px] bg-transparent text-xl lg:text-2xl text-foreground placeholder:text-grey-300 dark:placeholder:text-grey-600 border-none outline-none px-2 min-w-0"
              />
              <span className="shrink-0 pr-5 text-xl text-grey-400 dark:text-grey-500 font-medium select-none">
                .grsites.de
              </span>
            </div>
            <p className="text-sm text-grey-400 dark:text-grey-500 mt-3">
              Kleinbuchstaben, Zahlen und Bindestriche · 3–50 Zeichen
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
            <span className="text-sm text-grey-500 dark:text-grey-400">{subdomain}.grsites.de</span>
          </div>

          <div className="text-center mb-8">
            <h2 className="font-[GrueneTypeNeue] text-[length:var(--font-size-2xl)] lg:text-[length:var(--font-size-3xl)] text-foreground mb-2">
              Erzähl uns von dir
            </h2>
            <p className="text-[length:var(--font-size-base)] lg:text-[length:var(--font-size-lg)] text-grey-500 dark:text-grey-400 leading-relaxed">
              Die KI erstellt daraus deine professionelle Website.
            </p>
          </div>

          {/* Mode choice */}
          {onFlyerUpload && (
            <div className="flex justify-center mb-6">
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => v && setMode(v as InputMode)}
                variant="outline"
                disabled={isProcessing}
              >
                <ToggleGroupItem value="text">Selbst schreiben</ToggleGroupItem>
                <ToggleGroupItem value="flyer">Flyer hochladen</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}

          {/* Text mode */}
          {mode === 'text' && (
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
                disabled={isProcessing}
                autoFocus
                className="min-h-[240px] lg:min-h-[280px] resize-y text-base"
              />
              {descriptionLength > 0 && descriptionLength < MIN_DESCRIPTION ? (
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
          )}

          {/* Flyer mode */}
          {mode === 'flyer' && onFlyerUpload && (
            <div>
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
                    onClick={handleRemoveFile}
                    disabled={isProcessing}
                    className="shrink-0 p-1.5 rounded-md text-grey-400 dark:text-grey-500 hover:text-grey-600 dark:hover:text-grey-400 hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors bg-transparent border-none cursor-pointer"
                    aria-label="Datei entfernen"
                  >
                    <FiX className="size-4" />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-all',
                    isDragging
                      ? 'border-primary-500 bg-primary-50/50'
                      : 'border-grey-300 dark:border-grey-700 hover:border-primary-400 hover:bg-primary-50/30'
                  )}
                >
                  <FiUpload className="size-6 text-grey-400 dark:text-grey-500" />
                  <p className="text-sm text-grey-600 dark:text-grey-400 text-center">
                    <span className="font-medium text-primary-600 dark:text-primary-400">
                      Flyer hochladen
                    </span>{' '}
                    oder hierher ziehen
                  </p>
                  <p className="text-xs text-grey-400 dark:text-grey-500">PDF, max. 20 MB</p>
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
                  />
                </div>
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
                  {mode === 'flyer' ? 'Seite aus Flyer generieren' : 'Seite generieren'}
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
