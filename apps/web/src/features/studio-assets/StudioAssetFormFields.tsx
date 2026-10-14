import {
  STUDIO_ASSET_AUDIENCE_LABEL,
  STUDIO_ASSET_AUTHOR_NOTE,
  STUDIO_ASSET_RIGHTS_LABEL,
  TITLE_MAX,
  type StudioAssetFormValues,
} from '@gruenerator/shared/studio-assets';
import { Checkbox, Input, Label } from '@gruenerator/ui';
import { useId, type JSX } from 'react';

/** Title, tags, public sharing, audience and rights — shared by every studio-asset create form. */
export function StudioAssetFormFields({
  values,
  onChange,
  locale,
  disabled,
}: {
  values: StudioAssetFormValues;
  onChange: (next: StudioAssetFormValues) => void;
  locale: 'de-DE' | 'de-AT';
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
          <p className="m-0 text-sm text-grey-600 dark:text-grey-400">{STUDIO_ASSET_AUTHOR_NOTE}</p>
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
                {STUDIO_ASSET_AUDIENCE_LABEL[value]}
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
