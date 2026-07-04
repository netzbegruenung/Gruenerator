import { memo, useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';

import { sharepicLabel } from '../../hooks/useSharepicArtifact';
import { useSharepicThumbnail } from '../../hooks/useSharepicThumbnail';
import { cn } from '../../lib/utils';
import { useSharepicLiveStore } from '../../stores/sharepicLiveStore';

import { SharepicVariantCard } from './SharepicVariantCard';
import { SliderDeckCard } from './SliderDeckCard';

import type { SharepicData, SharepicVariant } from '../../hooks/useChatGraphStream';

interface SharepicVariantStackProps {
  data: SharepicData;
}

/**
 * Renders the sharepic variants of one turn. Multiple single-image variants
 * use a HERO layout — one full card (all controls intact) plus a thumbnail
 * strip to switch it — instead of stacking three full cards (~1300px). Deck
 * variants and single results keep their full cards.
 */
export function SharepicVariantStack({ data }: SharepicVariantStackProps) {
  const variants = data.variants ?? [];
  const isHeroLayout =
    variants.length > 1 && variants.every((v) => !v.pages || v.pages.length === 0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeVariantId = useSharepicLiveStore((s) => s.activeVariant?.variantId ?? null);

  // Activating a variant for chat editing (card toggle / panel) pulls it into
  // the hero slot so the inline card and the docked panel show the same
  // artifact while the user iterates.
  const activeIsOwn = activeVariantId != null && variants.some((v) => v.id === activeVariantId);
  useEffect(() => {
    if (activeIsOwn) setSelectedId(activeVariantId);
  }, [activeIsOwn, activeVariantId]);

  if (variants.length === 0) {
    return (
      <div className="mb-3 rounded-lg border border-border p-4 text-sm text-foreground-muted">
        Keine Sharepic-Varianten verfügbar.
      </div>
    );
  }

  if (!isHeroLayout) {
    return (
      <div className="mb-3 space-y-3">
        {variants.map((variant) =>
          variant.pages && variant.pages.length > 0 ? (
            <SliderDeckCard key={variant.id} variant={variant} />
          ) : (
            <SharepicVariantCard key={variant.id} variant={variant} />
          )
        )}
      </div>
    );
  }

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  if (!selected) return null;

  return (
    <div className="mb-3 space-y-2">
      <SharepicVariantCard key={selected.id} variant={selected} />
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={`${variants.length} Sharepic-Varianten`}
      >
        {variants.map((variant) => (
          <SharepicVariantThumb
            key={variant.id}
            variant={variant}
            isSelected={variant.id === selected.id}
            onSelect={() => setSelectedId(variant.id)}
          />
        ))}
      </div>
    </div>
  );
}

export const SharepicVariantThumb = memo(function SharepicVariantThumb({
  variant,
  isSelected,
  onSelect,
  className,
}: {
  variant: SharepicVariant;
  isSelected: boolean;
  onSelect: () => void;
  className?: string;
}) {
  const { imageBase64, failed } = useSharepicThumbnail(variant);
  const label = sharepicLabel(variant);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`Variante „${label}" anzeigen`}
      className={cn(
        'relative overflow-hidden rounded-md border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isSelected
          ? 'border-primary ring-2 ring-primary'
          : 'border-border opacity-80 hover:border-primary hover:opacity-100',
        className ?? 'w-24 shrink-0'
      )}
    >
      {imageBase64 ? (
        <img src={imageBase64} alt={label} className="aspect-[4/5] w-full object-cover" />
      ) : (
        <span className="flex aspect-[4/5] w-full items-center justify-center bg-background text-foreground-muted">
          {failed ? <ImageOff className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
        </span>
      )}
      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white">
        {label}
      </span>
    </button>
  );
});
