import {
  type GroupAudience,
  type StudioAssetCreateBody,
  type StudioAssetVisibility,
} from '@gruenerator/contracts';
import { STUDIO_ASSET_RIGHTS_LABEL } from '@gruenerator/shared/studio-assets';
import { Checkbox, Input, Label } from '@gruenerator/ui';
import { useId, type JSX } from 'react';

export const TITLE_MAX = 120;
const TAG_MAX = 30;
const TAGS_MAX = 10;

const COUNTRY_LABEL = { 'de-DE': 'Deutschland', 'de-AT': 'Österreich' } as const;

export interface StudioAssetFormValues {
  title: string;
  tags: string;
  visibility: StudioAssetVisibility;
  audience: GroupAudience;
  rights: boolean;
}

export const parseTags = (raw: string) =>
  [
    ...new Set(
      raw
        .split(',')
        .map((t) => t.trim().slice(0, TAG_MAX))
        .filter(Boolean)
    ),
  ].slice(0, TAGS_MAX);

/** Public items need the rights confirmation the API requires. */
export const isAssetFormComplete = (v: StudioAssetFormValues) =>
  v.title.trim() !== '' && (v.visibility !== 'public' || v.rights);

export const assetFormBody = (
  v: StudioAssetFormValues
): Pick<
  StudioAssetCreateBody,
  'title' | 'tags' | 'visibility' | 'audience' | 'rightsConfirmed'
> => ({
  title: v.title.trim(),
  tags: parseTags(v.tags),
  visibility: v.visibility,
  audience: v.audience,
  rightsConfirmed: v.visibility === 'public' && v.rights,
});

/** Title, tags, public sharing, audience and rights — shared by every studio-asset create form. */
export function StudioAssetFormFields({
  values,
  onChange,
  locale,
  disabled,
}: {
  values: StudioAssetFormValues;
  onChange: (next: StudioAssetFormValues) => void;
  locale: keyof typeof COUNTRY_LABEL;
  disabled: boolean;
}): JSX.Element {
  const ids = { title: useId(), tags: useId(), share: useId(), rights: useId() };
  const audienceName = useId();
  const set = (patch: Partial<StudioAssetFormValues>) => onChange({ ...values, ...patch });
  const isPublic = values.visibility === 'public';

  return (
    <>
      <div className="flex flex-col gap-xs">
        <Label htmlFor={ids.title}>Titel</Label>
        <Input
          id={ids.title}
          value={values.title}
          maxLength={TITLE_MAX}
          disabled={disabled}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-xs">
        <Label htmlFor={ids.tags}>Schlagwörter (optional, mit Komma getrennt)</Label>
        <Input
          id={ids.tags}
          value={values.tags}
          disabled={disabled}
          onChange={(e) => set({ tags: e.target.value })}
        />
      </div>

      <div className="flex items-start gap-sm">
        <Checkbox
          id={ids.share}
          checked={isPublic}
          disabled={disabled}
          onCheckedChange={(checked) =>
            set({ visibility: checked === true ? 'public' : 'private' })
          }
          className="mt-0.5"
        />
        <Label htmlFor={ids.share} className="text-sm leading-snug font-normal">
          Unter „Entdecken“ öffentlich teilen
        </Label>
      </div>

      {isPublic && (
        <>
          <fieldset className="m-0 flex flex-wrap gap-md border-0 p-0 text-sm">
            <legend className="mb-xs text-sm font-medium text-foreground">Sichtbar für</legend>
            {([locale, 'all'] as const).map((value) => (
              <label key={value} className="flex items-center gap-xs">
                <input
                  type="radio"
                  name={audienceName}
                  value={value}
                  checked={values.audience === value}
                  disabled={disabled}
                  onChange={() => set({ audience: value })}
                  className="accent-primary-600"
                />
                {value === 'all' ? 'Alle' : COUNTRY_LABEL[value]}
              </label>
            ))}
          </fieldset>
          <div className="flex items-start gap-sm">
            <Checkbox
              id={ids.rights}
              checked={values.rights}
              disabled={disabled}
              onCheckedChange={(checked) => set({ rights: checked === true })}
              className="mt-0.5"
            />
            <Label htmlFor={ids.rights} className="text-sm leading-snug font-normal">
              {STUDIO_ASSET_RIGHTS_LABEL}
            </Label>
          </div>
        </>
      )}
    </>
  );
}
