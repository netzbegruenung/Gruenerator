'use client';

import { useEffect, useState } from 'react';
import { Loader2, Image, Download, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { GeneratedImage } from '../../hooks/useChatGraphStream';

interface GeneratedImageDisplayProps {
  image: GeneratedImage;
}

const styleLabels: Record<GeneratedImage['style'], string> = {
  illustration: 'Illustration',
  realistic: 'Realistisch',
  pixel: 'Pixel Art',
  'green-edit': 'Stadt begrünen',
  sharepic: 'Sharepic',
};

export function GeneratedImageDisplay({ image }: GeneratedImageDisplayProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const imageSrc = image.base64 || image.url;

  // ESC to close + lock body scroll while open. Native overlay (no Radix Dialog)
  // because this is a passive image viewer, not a modal with focus-trap needs.
  useEffect(() => {
    if (!isLightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLightboxOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isLightboxOpen]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = image.filename || 'generated-image.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mb-3 space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background-secondary">
            <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
          </div>
        )}
        <button
          type="button"
          onClick={() => setIsLightboxOpen(true)}
          className="block cursor-zoom-in"
          aria-label="Bild vergrößert anzeigen"
        >
          <img
            src={imageSrc}
            alt="Generiertes Bild"
            className={cn(
              'max-h-[400px] w-auto rounded-lg transition-opacity',
              isLoading ? 'opacity-0' : 'opacity-100'
            )}
            onLoad={() => setIsLoading(false)}
          />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Image className="h-3 w-3" />
            {styleLabels[image.style]}
          </span>
          <span className="text-xs text-foreground-muted">
            {(image.generationTimeMs / 1000).toFixed(1)}s
          </span>
        </div>

        <button
          onClick={handleDownload}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-foreground-muted hover:bg-primary/10 hover:text-foreground"
          aria-label="Bild herunterladen"
        >
          <Download className="h-3 w-3" />
          <span>Herunterladen</span>
        </button>
      </div>

      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/90 p-4"
          onClick={() => setIsLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Bild vergrößert"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsLightboxOpen(false);
            }}
            className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={imageSrc}
            alt="Generiertes Bild (vergrößert)"
            className="max-h-[95vh] max-w-[95vw] cursor-default rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
