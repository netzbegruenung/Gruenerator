import { useState, useCallback, useRef } from 'react';
import { Loader2, Pencil, Download, ExternalLink, Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useChatConfigStore } from '../../stores/chatConfigStore';

import type { SharepicVariant } from '../../hooks/useChatGraphStream';

interface SharepicVariantCardProps {
  variant: SharepicVariant;
}

const FALLBACK_LABELS: Record<string, string> = {
  dreizeilen: 'Dreizeiler',
  'zitat-pure': 'Zitat',
  zitat: 'Zitat',
  info: 'Info',
  simple: 'Sharepic',
  veranstaltung: 'Veranstaltung',
  slider: 'Slider',
  freeform: 'Freeform',
};

export function SharepicVariantCard({ variant }: SharepicVariantCardProps) {
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState(false);
  const [altCopied, setAltCopied] = useState(false);
  const renderTimeRef = useRef(0);
  const startedRef = useRef(false);

  if (!startedRef.current) {
    startedRef.current = true;
    const renderFn = useChatConfigStore.getState().renderSharepic;
    if (!renderFn) {
      setRenderError(true);
      setIsRendering(false);
    } else {
      const start = Date.now();
      renderFn(variant.canvasType, variant.initialProps)
        .then((dataUrl) => {
          renderTimeRef.current = Date.now() - start;
          if (dataUrl) {
            setImageBase64(dataUrl);
          } else {
            setRenderError(true);
          }
        })
        .catch(() => setRenderError(true))
        .finally(() => setIsRendering(false));
    }
  }

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!imageBase64) return;
      const link = document.createElement('a');
      link.href = imageBase64;
      link.download = `sharepic-${variant.canvasType}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [imageBase64, variant.canvasType]
  );

  const handleEdit = useCallback(() => {
    useChatConfigStore.getState().onEditSharepic?.(variant);
  }, [variant]);

  const handleCopyAlt = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!variant.altText) return;
      void navigator.clipboard?.writeText(variant.altText).then(() => {
        setAltCopied(true);
        setTimeout(() => setAltCopied(false), 2000);
      });
    },
    [variant.altText]
  );

  const label = variant.label ?? FALLBACK_LABELS[variant.canvasType] ?? 'Sharepic';

  if (renderError) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-foreground-muted">
        Sharepic-Vorschau konnte nicht gerendert werden.
        <button onClick={handleEdit} className="ml-2 text-primary hover:underline">
          Im Editor öffnen
        </button>
      </div>
    );
  }

  return (
    <div className="group/sharepic relative overflow-hidden rounded-lg border border-border bg-background-alt transition-all hover:border-primary hover:shadow-md">
      <button
        type="button"
        onClick={handleEdit}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`${label}-Variante im Editor öffnen`}
      >
        <div className="relative">
          {isRendering && (
            <div className="flex h-64 items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
                <span className="text-xs text-foreground-muted">Rendere {label}...</span>
              </div>
            </div>
          )}
          {imageBase64 && (
            <img
              src={imageBase64}
              alt={variant.altText || `${label}-Sharepic`}
              className={cn(
                'mx-auto max-h-[420px] w-auto transition-opacity',
                isRendering ? 'opacity-0' : 'opacity-100'
              )}
            />
          )}
          {imageBase64 && !isRendering && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover/sharepic:bg-black/30 group-hover/sharepic:opacity-100">
              <div className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-lg">
                <ExternalLink className="h-4 w-4" />
                <span>Im Editor öffnen</span>
              </div>
            </div>
          )}
        </div>
      </button>

      {!isRendering && imageBase64 && variant.altText && (
        <div className="flex items-start justify-between gap-2 border-t border-border px-3 py-2">
          <p className="text-xs leading-snug text-foreground-muted">
            <span className="font-medium text-foreground">Alt-Text:</span> {variant.altText}
          </p>
          <button
            onClick={handleCopyAlt}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            aria-label="Alt-Text in die Zwischenablage kopieren"
          >
            {altCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>{altCopied ? 'Kopiert' : 'Kopieren'}</span>
          </button>
        </div>
      )}

      {!isRendering && imageBase64 && (
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {label}
            </span>
            {renderTimeRef.current > 0 && (
              <span className="text-xs text-foreground-muted">
                {(renderTimeRef.current / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-foreground-muted hover:bg-primary/10 hover:text-foreground"
              aria-label="Sharepic herunterladen"
            >
              <Download className="h-3 w-3" />
              <span>Herunterladen</span>
            </button>
            <button
              onClick={handleEdit}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10"
              aria-label="Sharepic bearbeiten"
            >
              <Pencil className="h-3 w-3" />
              <span>Bearbeiten</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
