import { siteVariantSchema, type SiteVariant } from '@gruenerator/contracts';
import { variantPreview } from '@gruenerator/sites-design';
import { ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';
import { useAuth } from '../../../SitesContext';

export const VARIANT_LABELS: Record<SiteVariant, string> = {
  dunkel: 'Dunkel',
  hell: 'Hell',
  leuchtend: 'Leuchtend',
};

export function VariantPicker() {
  const variant = useDraft((d) => d.variant);
  const blocks = useDraft((d) => d.blocks);
  const hasPortrait = useDraft((d) => d.profile_image !== '');
  const { setField } = useDraftActions();
  const { user } = useAuth();
  const locale = user?.locale ?? 'de-DE';

  return (
    <ToggleGroup
      type="single"
      value={variant}
      onValueChange={(next) => {
        const parsed = siteVariantSchema.safeParse(next);
        if (parsed.success) setField('variant', parsed.data);
      }}
      variant="outline"
      aria-label="Farbvariante"
      className="flex-wrap justify-start"
    >
      {siteVariantSchema.options.map((option) => {
        const bands = variantPreview(blocks, hasPortrait, option, locale);
        return (
          <ToggleGroupItem key={option} value={option} className="h-auto gap-2 px-3 py-2">
            {/* The page in miniature, header to footer, as this variant paints it. */}
            <span
              aria-hidden="true"
              className="flex h-10 w-7 flex-col overflow-hidden rounded-sm border border-grey-300"
            >
              {bands.map((band) => (
                <span key={band.key} className="flex-1" style={{ backgroundColor: band.colour }} />
              ))}
            </span>
            {VARIANT_LABELS[option]}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
