import { type StudioAssetModeration } from '@gruenerator/contracts';

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
