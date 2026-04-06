import { useState, useCallback, useRef } from 'react';
import { Loader2, Pencil, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useChatConfigStore } from '../../stores/chatConfigStore';

import type { SharepicData } from '../../hooks/useChatGraphStream';

interface SharepicImageDisplayProps {
  sharepicData: SharepicData;
}

const canvasTypeLabels: Record<string, string> = {
  dreizeilen: 'Dreizeiler',
  'zitat-pure': 'Zitat',
  zitat: 'Zitat',
  info: 'Info',
  simple: 'Sharepic',
  veranstaltung: 'Veranstaltung',
  slider: 'Slider',
  freeform: 'Freeform',
};

export function SharepicImageDisplay({ sharepicData }: SharepicImageDisplayProps) {
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState(false);
  const renderTimeRef = useRef(0);
  const startedRef = useRef(false);

  // Fire-and-forget render exactly once on mount — sharepicData is immutable from SSE
  if (!startedRef.current) {
    startedRef.current = true;
    const renderFn = useChatConfigStore.getState().renderSharepic;
    if (!renderFn) {
      setRenderError(true);
      setIsRendering(false);
    } else {
      const start = Date.now();
      renderFn(sharepicData.canvasType, sharepicData.initialProps)
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

  const handleDownload = useCallback(() => {
    if (!imageBase64) return;
    const link = document.createElement('a');
    link.href = imageBase64;
    link.download = `sharepic-${sharepicData.canvasType}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [imageBase64, sharepicData.canvasType]);

  const handleEdit = useCallback(() => {
    useChatConfigStore.getState().onEditSharepic?.(sharepicData);
  }, [sharepicData]);

  const label = canvasTypeLabels[sharepicData.canvasType] || 'Sharepic';

  if (renderError) {
    return (
      <div className="mb-3 rounded-lg border border-border p-4 text-sm text-foreground-muted">
        Sharepic-Vorschau konnte nicht gerendert werden.
        <button
          onClick={handleEdit}
          className="ml-2 text-primary hover:underline"
        >
          Im Editor öffnen
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border">
        {isRendering && (
          <div className="flex h-48 items-center justify-center bg-background-alt">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
              <span className="text-xs text-foreground-muted">Rendere Sharepic...</span>
            </div>
          </div>
        )}
        {imageBase64 && (
          <img
            src={imageBase64}
            alt={`${label}-Sharepic`}
            className={cn(
              'max-h-[400px] w-auto rounded-lg transition-opacity',
              isRendering ? 'opacity-0' : 'opacity-100'
            )}
          />
        )}
      </div>

      {!isRendering && imageBase64 && (
        <div className="flex items-center justify-between">
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
