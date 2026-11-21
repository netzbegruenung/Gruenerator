import { siteHeaderStyleSchema, siteHeroLayoutSchema } from '@gruenerator/contracts';
import { ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';

const CHOICES = {
  header: {
    label: 'Kopfzeile',
    schema: siteHeaderStyleSchema,
    labels: { weiss: 'Weiß', farbig: 'In Farbvariante' },
  },
  heroLayout: {
    label: 'Kopfbereich',
    schema: siteHeroLayoutSchema,
    labels: { portrait: 'Porträt', vollbild: 'Vollbild' },
  },
} as const;

/** One of the design switches stored in the draft: the header colour or the hero layout. */
export function DesignChoice({ field }: { field: keyof typeof CHOICES }) {
  const choice = CHOICES[field];
  const value = useDraft((d) => d[field]);
  const { setField } = useDraftActions();
  const labels: Record<string, string> = choice.labels;

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (field === 'header') {
          const parsed = siteHeaderStyleSchema.safeParse(next);
          if (parsed.success) setField('header', parsed.data);
        } else {
          const parsed = siteHeroLayoutSchema.safeParse(next);
          if (parsed.success) setField('heroLayout', parsed.data);
        }
      }}
      variant="outline"
      aria-label={choice.label}
      className="flex-wrap justify-start"
    >
      {choice.schema.options.map((option) => (
        <ToggleGroupItem key={option} value={option} className="h-auto px-3 py-2">
          {labels[option]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
