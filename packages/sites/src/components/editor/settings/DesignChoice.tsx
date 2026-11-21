import { siteHeaderStyleSchema } from '@gruenerator/contracts';
import { ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';

const CHOICES = {
  header: {
    label: 'Kopfzeile',
    schema: siteHeaderStyleSchema,
    labels: { weiss: 'Weiß', farbig: 'In Farbvariante' },
  },
} as const;

/** A design switch stored in the draft: the header colour. The hero layout lives on the hero. */
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
        const parsed = siteHeaderStyleSchema.safeParse(next);
        if (parsed.success) setField(field, parsed.data);
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
