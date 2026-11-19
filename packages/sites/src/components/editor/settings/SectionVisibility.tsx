import { siteOptionalSectionSchema, type SiteOptionalSection } from '@gruenerator/contracts';
import { Label, Switch } from '@gruenerator/ui';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';
import { SECTION_LABELS } from '../../../stores/editorStore';

export function SectionVisibility() {
  const hidden = useDraft((d) => d.hidden);
  const { setField } = useDraftActions();

  const toggle = (section: SiteOptionalSection, show: boolean) => {
    const next = new Set(hidden);
    if (show) next.delete(section);
    else next.add(section);
    // The schema lists the optional sections in SITE_SECTION_IDS order.
    setField(
      'hidden',
      siteOptionalSectionSchema.options.filter((option) => next.has(option))
    );
  };

  return (
    <ul className="m-0 flex list-none flex-col gap-sm p-0">
      {siteOptionalSectionSchema.options.map((section) => {
        const id = `section-visible-${section}`;
        return (
          <li key={section} className="flex items-center gap-sm">
            <Switch
              id={id}
              checked={!hidden.includes(section)}
              onCheckedChange={(checked) => toggle(section, checked)}
            />
            <Label htmlFor={id} className="text-base text-foreground">
              {SECTION_LABELS[section]}
            </Label>
          </li>
        );
      })}
    </ul>
  );
}
