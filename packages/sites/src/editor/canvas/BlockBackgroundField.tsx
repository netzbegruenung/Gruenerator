import {
  siteBlockBackgroundSchema,
  type SiteBlockBackground,
  type SupportedLocale,
} from '@gruenerator/contracts';
import { backgroundSwatch, blockOnPhoto } from '@gruenerator/sites-design';
import { ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';

import { useDraft, useDraftActions } from '../../draft/SiteDraftContext';
import { useAuth } from '../../SitesContext';

const AUTO = 'auto';

/** Named after the colour each country paints: Austria has no cream, its "hell" is Hellgrün. */
const BACKGROUND_LABELS: Record<SupportedLocale, Record<SiteBlockBackground, string>> = {
  'de-DE': { weiss: 'Weiß', hell: 'Creme', dunkel: 'Dunkelgrün', leuchtend: 'Leuchtgrün' },
  'de-AT': { weiss: 'Weiß', hell: 'Hellgrün', dunkel: 'Dunkelgrün', leuchtend: 'Grün' },
};

/**
 * The block's own background, over the colour variant. Left out while a photo is the background,
 * because a choice would change nothing on the page.
 */
export function BlockBackgroundField({ blockId }: { blockId: string }) {
  const block = useDraft((d) => d.blocks.find((entry) => entry.id === blockId) ?? null);
  const hasPortrait = useDraft((d) => d.profile_image !== '');
  const { setBlockField } = useDraftActions();
  const { user } = useAuth();
  const locale = user?.locale ?? 'de-DE';
  if (!block || blockOnPhoto(block, hasPortrait)) return null;
  const labelId = `${blockId}-background`;

  return (
    <div className="mt-md">
      <p id={labelId} className="mb-1.5 block text-sm font-medium text-foreground">
        Hintergrund
      </p>
      <ToggleGroup
        type="single"
        value={block.background ?? AUTO}
        onValueChange={(next) => {
          if (next === AUTO) {
            setBlockField(blockId, block.type, { background: null });
            return;
          }
          const parsed = siteBlockBackgroundSchema.safeParse(next);
          if (parsed.success) setBlockField(blockId, block.type, { background: parsed.data });
        }}
        variant="outline"
        aria-labelledby={labelId}
        className="flex-wrap justify-start"
      >
        <ToggleGroupItem value={AUTO} className="h-auto px-3 py-2">
          Automatisch
        </ToggleGroupItem>
        {siteBlockBackgroundSchema.options.map((option) => (
          <ToggleGroupItem key={option} value={option} className="h-auto gap-2 px-3 py-2">
            <span
              aria-hidden="true"
              className="size-4 rounded-full border border-grey-300"
              style={{ backgroundColor: backgroundSwatch(option, locale) }}
            />
            {BACKGROUND_LABELS[locale][option]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
