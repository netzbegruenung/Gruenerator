import { Button } from '@gruenerator/sites-design';
import { useCallback, useState } from 'react';
import { FiArrowLeft, FiCheck, FiClipboard, FiRefreshCw } from 'react-icons/fi';

import { cn } from '../utils/cn';

interface WordPressJsonResultProps {
  json: string;
  onBack: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}

export function WordPressJsonResult({
  json,
  onBack,
  onRegenerate,
  isRegenerating,
}: WordPressJsonResultProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = json;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [json]);

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

      <div className="relative z-10 w-full max-w-[800px] lg:max-w-[920px] mx-auto bg-white rounded-2xl shadow-lg animate-[step-enter_0.4s_ease-out]">
        <div className="px-8 py-8 md:px-10 lg:px-14 md:py-10 lg:py-12">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-50 mb-4">
              <FiCheck className="size-7 text-primary-600" />
            </div>
            <h2 className="font-[GrueneTypeNeue] text-[length:var(--font-size-2xl)] lg:text-[length:var(--font-size-3xl)] text-primary-800 mb-2">
              Deine WordPress-Texte sind fertig!
            </h2>
            <p className="text-[length:var(--font-size-base)] lg:text-[length:var(--font-size-lg)] text-grey-500 leading-relaxed max-w-[560px] mx-auto">
              Kopiere den JSON-Text und füge ihn im WordPress-Plugin unter &quot;Grünerator Texte
              verwenden&quot; ein.
            </p>
          </div>

          <div className="relative">
            <textarea
              readOnly
              value={json}
              rows={16}
              className="w-full rounded-lg border border-grey-200 bg-grey-50 p-4 font-mono text-sm text-grey-700 resize-y focus:outline-none focus:border-primary-400"
            />
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={handleCopy}
              className={cn(
                'h-12 px-10 text-base lg:text-lg font-semibold rounded-lg transition-all',
                copied
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gradient-to-br from-primary-600 to-primary-700 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(49,96,73,0.3)]'
              )}
            >
              {copied ? (
                <>
                  <FiCheck className="size-5" />
                  Kopiert!
                </>
              ) : (
                <>
                  <FiClipboard className="size-5" />
                  JSON kopieren
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="h-12 px-8 text-base font-semibold rounded-lg"
            >
              {isRegenerating ? (
                <>
                  <span className="size-5 border-2 border-grey-300 border-t-primary-600 rounded-full animate-[spin_1s_linear_infinite]" />
                  Generiert...
                </>
              ) : (
                <>
                  <FiRefreshCw className="size-4" />
                  Neu generieren
                </>
              )}
            </Button>
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={onBack}
              disabled={isRegenerating}
              className="inline-flex items-center gap-1.5 text-sm text-grey-500 hover:text-primary-600 transition-colors bg-transparent border-none cursor-pointer p-0"
            >
              <FiArrowLeft className="size-4" />
              Zurück
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
