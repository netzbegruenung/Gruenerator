import { SharepicVariantCard } from './SharepicVariantCard';

import type { SharepicData } from '../../hooks/useChatGraphStream';

interface SharepicVariantStackProps {
  data: SharepicData;
}

export function SharepicVariantStack({ data }: SharepicVariantStackProps) {
  if (!data.variants || data.variants.length === 0) {
    return (
      <div className="mb-3 rounded-lg border border-border p-4 text-sm text-foreground-muted">
        Keine Sharepic-Varianten verfügbar.
      </div>
    );
  }

  return (
    <div className="mb-3 space-y-3">
      {data.variants.map((variant) => (
        <SharepicVariantCard key={variant.id} variant={variant} />
      ))}
    </div>
  );
}
