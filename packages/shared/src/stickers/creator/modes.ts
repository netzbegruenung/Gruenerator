import { type StudioAssetSource } from '@gruenerator/contracts';

/** The creator's three ways to a sticker, in the order both platforms offer them. */
export const STICKER_CREATOR_MODES = [
  {
    id: 'upload',
    title: 'Bild hochladen',
    text: 'Du hast schon ein PNG oder WebP mit transparentem Hintergrund.',
  },
  {
    id: 'cutout',
    title: 'Foto freistellen',
    text: 'Aus einem Foto wird ein Sticker mit weißer Kontur – wie ausgeschnitten.',
  },
  {
    id: 'badge',
    title: 'Text-Badge',
    text: 'Störer, Banner oder Sprechblase mit deinem Text in den Parteifarben.',
  },
] as const satisfies readonly { id: StudioAssetSource; title: string; text: string }[];

export const stickerCreatorModeTitle = (id: StudioAssetSource) =>
  STICKER_CREATOR_MODES.find((m) => m.id === id)?.title ?? 'Gestalten';

export const STICKER_CREATOR_STEPS = [
  { key: 'mode', label: 'Art wählen' },
  { key: 'design', label: 'Gestalten' },
  { key: 'save', label: 'Speichern' },
] as const;
