import { useCallback, useState } from 'react';

import { useSlidesAdapter, createSlidesApiClient } from '../context/SlidesContext';
import {
  type GenerationTone,
  type GenerationVerbosity,
  type GeneratePresentationResponse,
} from '../types/slide';

interface GeneratePresentationDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (presentationId: string) => void;
}

type DialogState = 'idle' | 'generating' | 'success' | 'error';

const TONES: { value: GenerationTone; label: string }[] = [
  { value: 'default', label: 'Standard' },
  { value: 'professional', label: 'Professionell' },
  { value: 'casual', label: 'Locker' },
  { value: 'educational', label: 'Bildung' },
  { value: 'sales_pitch', label: 'Verkauf' },
];

const VERBOSITIES: { value: GenerationVerbosity; label: string }[] = [
  { value: 'concise', label: 'Knapp' },
  { value: 'standard', label: 'Standard' },
  { value: 'text-heavy', label: 'Ausführlich' },
];

export function GeneratePresentationDialog({
  open,
  onClose,
  onGenerated,
}: GeneratePresentationDialogProps) {
  const adapter = useSlidesAdapter();
  const apiClient = createSlidesApiClient(adapter);

  const [content, setContent] = useState('');
  const [tone, setTone] = useState<GenerationTone>('professional');
  const [verbosity, setVerbosity] = useState<GenerationVerbosity>('standard');
  const [nSlides, setNSlides] = useState(8);
  const [language, setLanguage] = useState('Deutsch');
  const [instructions, setInstructions] = useState('');
  const [includeTitleSlide, setIncludeTitleSlide] = useState(true);
  const [includeToc, setIncludeToc] = useState(false);

  const [state, setState] = useState<DialogState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleGenerate = useCallback(async () => {
    if (!content.trim()) return;
    setState('generating');
    setErrorMsg('');

    try {
      const result = await apiClient.post<GeneratePresentationResponse>('/presentations/generate', {
        content: content.trim(),
        tone,
        verbosity,
        nSlides,
        language,
        instructions: instructions.trim() || null,
        includeTitleSlide,
        includeTableOfContents: includeToc,
      });

      setState('success');
      onGenerated(result.presentationId);
    } catch (err) {
      setState('error');
      setErrorMsg((err as Error).message || 'Fehler bei der Erstellung');
    }
  }, [
    content,
    tone,
    verbosity,
    nSlides,
    language,
    instructions,
    includeTitleSlide,
    includeToc,
    apiClient,
    onGenerated,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-grey-800 rounded-2xl shadow-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between p-5 border-b border-grey-200 dark:border-grey-700">
          <h2 className="text-lg font-semibold text-foreground">Präsentation erstellen</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-grey-100 dark:hover:bg-grey-700 transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {state === 'generating' ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-grey-500">Präsentation wird erstellt...</p>
              <p className="text-xs text-grey-400">Das kann bis zu 30 Sekunden dauern</p>
            </div>
          ) : state === 'error' ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-red-500">{errorMsg}</p>
              <button
                onClick={() => setState('idle')}
                className="px-4 py-2 rounded-lg border border-grey-300 text-sm hover:bg-grey-50"
              >
                Erneut versuchen
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Thema / Inhalt *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Worüber soll die Präsentation sein?"
                  rows={3}
                  className="w-full rounded-lg border border-grey-300 dark:border-grey-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Ton</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as GenerationTone)}
                    className="w-full rounded-lg border border-grey-300 dark:border-grey-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary-500"
                  >
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Ausführlichkeit
                  </label>
                  <select
                    value={verbosity}
                    onChange={(e) => setVerbosity(e.target.value as GenerationVerbosity)}
                    className="w-full rounded-lg border border-grey-300 dark:border-grey-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary-500"
                  >
                    {VERBOSITIES.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Folienanzahl
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={nSlides}
                    onChange={(e) => setNSlides(Number(e.target.value))}
                    className="w-full rounded-lg border border-grey-300 dark:border-grey-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Sprache
                  </label>
                  <input
                    type="text"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-lg border border-grey-300 dark:border-grey-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeTitleSlide}
                    onChange={(e) => setIncludeTitleSlide(e.target.checked)}
                    className="rounded border-grey-300"
                  />
                  Titelfolie
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeToc}
                    onChange={(e) => setIncludeToc(e.target.checked)}
                    className="rounded border-grey-300"
                  />
                  Inhaltsverzeichnis
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Zusätzliche Anweisungen
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Optionale Hinweise für die KI..."
                  rows={2}
                  className="w-full rounded-lg border border-grey-300 dark:border-grey-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 resize-none"
                />
              </div>
            </>
          )}
        </div>

        {state === 'idle' && (
          <div className="flex justify-end gap-3 p-5 border-t border-grey-200 dark:border-grey-700">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-grey-300 dark:border-grey-600 text-sm hover:bg-grey-50 dark:hover:bg-grey-700 transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleGenerate}
              disabled={!content.trim()}
              className="px-5 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Erstellen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
