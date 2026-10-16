import {
  type GroupAudience,
  type StudioAssetCreateBody,
  type StudioAssetVisibility,
} from '@gruenerator/contracts';

export const TITLE_MAX = 120;
const TAG_MAX = 30;
const TAGS_MAX = 10;

/** How each audience reads in a create form; a locale's own country plus „Alle". */
export const STUDIO_ASSET_AUDIENCE_LABEL = {
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
  all: 'Alle',
} as const satisfies Record<GroupAudience, string>;

export interface StudioAssetFormValues {
  title: string;
  tags: string;
  visibility: StudioAssetVisibility;
  audience: GroupAudience;
  rights: boolean;
}

export const emptyAssetForm = (audience: GroupAudience): StudioAssetFormValues => ({
  title: '',
  tags: '',
  visibility: 'private',
  audience,
  rights: false,
});

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
