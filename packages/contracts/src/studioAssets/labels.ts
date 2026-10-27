import {
  type StudioAssetKind,
  type StudioAssetModeration,
  type StudioAssetScope,
} from '../schemas/studioAssets.js';

/** The gallery lists every picker and the gallery page offer, in tab order. */
export const STUDIO_ASSET_SCOPES = [
  { value: 'shop', label: 'Entdecken' },
  { value: 'mine', label: 'Meine' },
  { value: 'saved', label: 'Gemerkt' },
] as const satisfies readonly { value: StudioAssetScope; label: string }[];

export const STUDIO_ASSET_PLURAL: Record<StudioAssetKind, string> = {
  sticker: 'Sticker',
  background: 'Hintergründe',
};

const EMPTY: Record<StudioAssetScope, (noun: string) => string> = {
  shop: (noun) => `Unter „Entdecken“ gibt es noch keine ${noun}.`,
  mine: (noun) => `Du hast noch keine eigenen ${noun}.`,
  saved: (noun) => `Du hast dir noch keine ${noun} gemerkt.`,
};

/** What an empty gallery list says. */
export function galleryScopeEmptyText(kind: StudioAssetKind, scope: StudioAssetScope): string {
  return EMPTY[scope](STUDIO_ASSET_PLURAL[kind]);
}

/** Shown with the public switch: public items carry their author's name. */
export const STUDIO_ASSET_AUTHOR_NOTE = 'Dein Name wird dabei angezeigt.';

/** The confirmation the API requires before an item goes public. */
export const STUDIO_ASSET_RIGHTS_LABEL =
  'Ich habe die Rechte an diesem Bild und es darf öffentlich geteilt werden.';

/** The badge an owner sees on a moderated item. */
export const STUDIO_ASSET_MODERATION_BADGE = {
  hidden: {
    label: 'Ausgeblendet',
    hint: 'Nach einer Meldung ausgeblendet, bis wir es geprüft haben. Andere sehen es so lange nicht.',
  },
  removed: {
    label: 'Entfernt',
    hint: 'Nach Prüfung entfernt. Das Bild wird nicht mehr ausgeliefert, auch nicht in deinen Designs.',
  },
} as const satisfies Record<Exclude<StudioAssetModeration, 'ok'>, { label: string; hint: string }>;
