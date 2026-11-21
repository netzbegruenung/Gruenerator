import { siteHeaderStyleSchema, type SiteHeaderStyle } from '@gruenerator/contracts';
import { ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';

const HEADER_LABELS: Record<SiteHeaderStyle, string> = {
  weiss: 'Weiß',
  farbig: 'In Farbvariante',
};

export function HeaderStylePicker() {
  const header = useDraft((d) => d.header);
  const { setField } = useDraftActions();

  return (
    <ToggleGroup
      type="single"
      value={header}
      onValueChange={(next) => {
        const parsed = siteHeaderStyleSchema.safeParse(next);
        if (parsed.success) setField('header', parsed.data);
      }}
      variant="outline"
      aria-label="Kopfzeile"
      className="flex-wrap justify-start"
    >
      {siteHeaderStyleSchema.options.map((option) => (
        <ToggleGroupItem key={option} value={option} className="h-auto px-3 py-2">
          {HEADER_LABELS[option]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
