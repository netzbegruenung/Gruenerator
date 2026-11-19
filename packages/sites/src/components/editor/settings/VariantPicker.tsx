import { siteVariantSchema, type SiteVariant } from '@gruenerator/contracts';
import { variantSwatches } from '@gruenerator/sites-design';
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
        const { hero, band } = variantSwatches(option, locale);
        return (
          <ToggleGroupItem key={option} value={option} className="h-auto gap-2 px-3 py-2">
            <span
              aria-hidden="true"
              className="flex h-5 w-8 overflow-hidden rounded-sm border border-grey-300"
            >
              <span className="flex-1" style={{ backgroundColor: hero.ground }} />
              <span className="flex-1" style={{ backgroundColor: band.ground }} />
              <span className="w-2" style={{ backgroundColor: hero.accent }} />
            </span>
            {VARIANT_LABELS[option]}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
