import { Button } from '@gruenerator/sites-design';
import { useCallback, useRef, useState } from 'react';
import { FiArrowLeft, FiArrowRight, FiFile, FiLogOut, FiUpload, FiX } from 'react-icons/fi';

import { cn } from '../utils/cn';

import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

interface CreateSiteScreenProps {
  subdomain: string;
  onSubdomainChange: (value: string) => void;
  contactEmail: string;
  onContactEmailChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  onGenerate: () => void;
  onFlyerUpload?: (file: File) => void;
  isProcessing: boolean;
  isGenerating: boolean;
  isGeneratingFromFlyer?: boolean;
  onLogout: () => void;
  userEmail?: string;
}

export function CreateSiteScreen({
  subdomain,
  onSubdomainChange,
  contactEmail,
  onContactEmailChange,
  description,
  onDescriptionChange,
  onGenerate,
  onFlyerUpload,
  isProcessing,
  isGenerating,
  isGeneratingFromFlyer,
  onLogout,
  userEmail,
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

  const handleFileSelect = useCallback(
    (file: File) => {
      if (file.type !== 'application/pdf') return;
      setSelectedFile(file);
      onDescriptionChange('');
    },
    [onDescriptionChange]
  );

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
    if (selectedFile && onFlyerUpload) {
      onFlyerUpload(selectedFile);
    } else {
      onGenerate();
    }
  }, [selectedFile, onFlyerUpload, onGenerate]);

  const canProceed = subdomain.trim().length >= 3;
  const canGenerate = selectedFile ? !!onFlyerUpload : !!description.trim();

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-neutral-600 px-md py-xl lg:px-xl overflow-hidden">
      {/* Decorative background blobs */}
      <svg
        className="absolute -top-32 -right-32 w-[600px] h-[600px] opacity-20 hidden md:block"
        viewBox="0 0 600 600"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="300" cy="300" r="300" fill="var(--primary-100)" />
      </svg>
      <svg
        className="absolute -bottom-48 -left-48 w-[700px] h-[700px] opacity-15 hidden md:block"
        viewBox="0 0 700 700"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="350" cy="350" r="350" fill="var(--primary-200)" />
      </svg>
      <svg
        className="absolute top-1/4 right-[15%] w-[250px] h-[250px] opacity-10 hidden xl:block"
        viewBox="0 0 250 250"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="125" cy="125" r="125" fill="var(--primary-300)" />
      </svg>

      {/* Logout */}
      <div className="absolute top-5 right-5 flex items-center gap-3 z-10">
        {userEmail && <span className="text-sm text-grey-400 hidden sm:inline">{userEmail}</span>}
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="text-grey-500 hover:text-grey-800"
        >
          <FiLogOut className="size-4" />
          <span className="hidden sm:inline">Abmelden</span>
        </Button>
      </div>

      {/* Step indicator */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-10">
        <div
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            step === 0
              ? 'w-10 bg-primary-600'
              : 'w-3 bg-primary-200 cursor-pointer hover:bg-primary-300'
          )}
          onClick={() => !isProcessing && setStep(0)}
          role="button"
          aria-label="Schritt 1"
        />
        <div
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            step === 1 ? 'w-10 bg-primary-600' : 'w-3 bg-primary-200'
          )}
          aria-label="Schritt 2"
        />
      </div>

      {/* Step 1: Domain — full-width centered content, no card */}
      {step === 0 && (
        <div
          key="step-0"
          className="relative z-10 w-full max-w-[640px] lg:max-w-[720px] mx-auto text-center animate-[step-enter_0.4s_ease-out]"
        >
          {/* Leaf icon */}
          <svg
            className="mx-auto mb-6 w-14 h-14 lg:w-16 lg:h-16 text-primary-500"
            viewBox="0 0 40 40"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M20 4C20 4 8 12 8 24C8 30 13 36 20 36C27 36 32 30 32 24C32 12 20 4 20 4Z"
              fill="currentColor"
              opacity="0.15"
            />
            <path
              d="M20 4C20 4 8 12 8 24C8 30 13 36 20 36C27 36 32 30 32 24C32 12 20 4 20 4Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path d="M20 36V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path
              d="M20 22C16 20 13 22 12 24"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M20 18C24 16 27 18 28 20"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>

          <h1 className="font-[GrueneTypeNeue] text-[length:var(--font-size-3xl)] lg:text-[length:var(--font-size-4xl)] text-primary-800 mb-4">
            Deine Kandidat*innen-Seite
          </h1>
          <p className="text-[length:var(--font-size-lg)] text-grey-500 leading-relaxed mb-12 max-w-[500px] mx-auto">
            Wähle die Adresse für deine neue Website.
          </p>

          {/* Big URL input */}
          <div className="max-w-[560px] lg:max-w-[600px] mx-auto">
            <Label htmlFor="subdomain" className="sr-only">
              Subdomain
            </Label>
            <div className="flex items-center rounded-xl border-2 border-grey-200 bg-white shadow-lg transition-all focus-within:border-primary-500 focus-within:shadow-[0_0_0_6px_rgba(49,96,73,0.08)]">
              <span className="shrink-0 pl-5 pr-1 text-xl text-grey-300 select-none hidden sm:inline">
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
                className="flex-1 h-16 lg:h-[72px] bg-transparent text-xl lg:text-2xl text-grey-900 placeholder:text-grey-300 border-none outline-none px-2 min-w-0"
              />
              <span className="shrink-0 pr-5 text-xl text-grey-400 font-medium select-none">
                .grsites.de
              </span>
            </div>
            <p className="text-sm text-grey-400 mt-3">
              Kleinbuchstaben, Zahlen und Bindestriche · 3–50 Zeichen
            </p>
          </div>

          <div className="mt-12">
            <Button
              size="lg"
              onClick={() => setStep(1)}
              disabled={!canProceed}
              className="h-12 px-12 bg-gradient-to-br from-primary-600 to-primary-700 text-base lg:text-lg font-semibold rounded-lg hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(49,96,73,0.3)] transition-all"
            >
              Weiter
              <FiArrowRight className="size-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Details + Generate — card layout for visual grouping */}
      {step === 1 && (
        <div
          key="step-1"
          className="relative z-10 w-full max-w-[800px] lg:max-w-[920px] xl:max-w-[1000px] mx-auto bg-white rounded-2xl shadow-lg animate-[step-enter_0.4s_ease-out]"
        >
          <div className="px-8 py-8 md:px-10 lg:px-14 md:py-10 lg:py-12">
            {/* Back + Domain badge */}
            <div className="flex items-center justify-between mb-8 lg:mb-10">
              <button
                onClick={() => setStep(0)}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 text-sm text-grey-500 hover:text-primary-600 transition-colors bg-transparent border-none cursor-pointer p-0"
              >
                <FiArrowLeft className="size-4" />
                Zurück
              </button>
              <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 px-4 py-2 rounded-full text-sm font-medium">
                <span className="w-2 h-2 rounded-full bg-primary-500" />
                {subdomain}.grsites.de
              </div>
            </div>

            <div className="mb-8 lg:mb-10">
              <h2 className="font-[GrueneTypeNeue] text-[length:var(--font-size-2xl)] lg:text-[length:var(--font-size-3xl)] text-primary-800 mb-2">
                Erzähl uns von dir
              </h2>
              <p className="text-[length:var(--font-size-base)] lg:text-[length:var(--font-size-lg)] text-grey-500 leading-relaxed">
                Die KI erstellt daraus deine professionelle Website.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-10">
              {/* Left column: Description + Flyer upload (takes 3/5) */}
              <div className="space-y-2 lg:col-span-3">
                <Label htmlFor="description" className="text-base">
                  Beschreibung {!selectedFile && '*'}
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
                  disabled={isProcessing || !!selectedFile}
                  autoFocus
                  className={cn(
                    'min-h-[240px] lg:min-h-[300px] resize-y text-base',
                    selectedFile && 'opacity-50'
                  )}
                />
                <p className="text-sm text-grey-400">Je mehr Details, desto besser das Ergebnis.</p>

                {/* Divider */}
                {onFlyerUpload && (
                  <>
                    <div className="flex items-center gap-4 py-3">
                      <div className="flex-1 h-px bg-grey-200" />
                      <span className="text-sm text-grey-400 font-medium">Oder</span>
                      <div className="flex-1 h-px bg-grey-200" />
                    </div>

                    {/* Flyer upload zone */}
                    {selectedFile ? (
                      <div className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50/50 p-4">
                        <FiFile className="size-8 text-primary-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-grey-800 truncate">
                            {selectedFile.name}
                          </p>
                          <p className="text-xs text-grey-500">
                            {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                        <button
                          onClick={handleRemoveFile}
                          disabled={isProcessing}
                          className="shrink-0 p-1.5 rounded-md text-grey-400 hover:text-grey-600 hover:bg-grey-100 transition-colors bg-transparent border-none cursor-pointer"
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
                          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-all',
                          isDragging
                            ? 'border-primary-500 bg-primary-50/50'
                            : 'border-grey-300 hover:border-primary-400 hover:bg-primary-50/30',
                          description.trim() && 'opacity-50'
                        )}
                      >
                        <FiUpload className="size-6 text-grey-400" />
                        <p className="text-sm text-grey-600 text-center">
                          <span className="font-medium text-primary-600">Flyer hochladen</span> oder
                          hierher ziehen
                        </p>
                        <p className="text-xs text-grey-400">PDF, max. 20 MB</p>
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
                  </>
                )}
              </div>

              {/* Right column: Email + Tips (takes 2/5) */}
              <div className="space-y-6 lg:col-span-2">
                <div className="space-y-2">
                  <Label htmlFor="contact_email" className="text-base">
                    Kontakt E-Mail
                  </Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => onContactEmailChange(e.target.value)}
                    placeholder="kontakt@example.de"
                    disabled={isProcessing}
                    className="h-11"
                  />
                  <p className="text-sm text-grey-400">Wird auf deiner Kontaktseite angezeigt.</p>
                </div>

                <div className="bg-primary-50/60 rounded-xl p-6 space-y-3">
                  <p className="text-sm font-semibold text-primary-800">
                    Tipps für ein gutes Ergebnis
                  </p>
                  <ul className="text-sm text-primary-700/80 space-y-2.5 leading-relaxed">
                    <li className="flex gap-2.5">
                      <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-400" />
                      Nenne deinen Namen und deine politische Rolle
                    </li>
                    <li className="flex gap-2.5">
                      <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-400" />
                      Beschreibe 2–3 Kernthemen, die dir wichtig sind
                    </li>
                    <li className="flex gap-2.5">
                      <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-400" />
                      Erwähne deinen Wahlkreis oder deine Region
                    </li>
                    <li className="flex gap-2.5">
                      <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-400" />
                      Persönliche Details machen die Seite authentisch
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Generate button */}
            <div className="mt-10 flex justify-end">
              <Button
                size="lg"
                onClick={handleGenerateClick}
                disabled={isProcessing || !canGenerate}
                className="h-12 px-10 bg-gradient-to-br from-primary-600 to-primary-700 text-base lg:text-lg font-semibold rounded-lg hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(49,96,73,0.3)] transition-all"
              >
                {isProcessing ? (
                  <>
                    <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-[spin_1s_linear_infinite]" />
                    {isGenerating || isGeneratingFromFlyer ? 'KI generiert...' : 'Wird erstellt...'}
                  </>
                ) : (
                  <>
                    {selectedFile ? 'Seite aus Flyer generieren' : 'Seite generieren'}
                    <FiArrowRight className="size-5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
