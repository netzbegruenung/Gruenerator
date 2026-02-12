'use client';

import { useState } from 'react';
import { Loader2, Image, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { GeneratedImage } from '../../hooks/useChatGraphStream';

interface GeneratedImageDisplayProps {
  image: GeneratedImage;
}

const styleLabels: Record<GeneratedImage['style'], string> = {
  illustration: 'Illustration',
  realistic: 'Realistisch',
  pixel: 'Pixel Art',
};

export function GeneratedImageDisplay({ image }: GeneratedImageDisplayProps) {
  const [isLoading, setIsLoading] = useState(true);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = image.base64 || image.url;
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
        <img
          src={image.base64 || image.url}
          alt="Generiertes Bild"
          className={cn(
            'max-h-[400px] w-auto rounded-lg transition-opacity',
            isLoading ? 'opacity-0' : 'opacity-100'
          )}
          onLoad={() => setIsLoading(false)}
        />
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
    </div>
  );
}
