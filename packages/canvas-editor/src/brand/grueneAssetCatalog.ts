/**
 * The Grünerator's asset catalogue as host data: the curated sharepic emoji,
 * the shared system stickers (`SYSTEM_STICKERS`, the same set as the
 * Profilbild) and the catalogue graphics, plus the share paths a shop sticker
 * draws from. apps/web installs it at startup (`registerAssetCatalog`); the
 * editor core only ever asks the registered catalogue. Ids and files are F0,
 * stored in canvases and templates.
 */
import {
  assetMatchesLocale,
  type AssetAudience,
  type CanvasAssetCatalog,
  emojiCodeAssetId,
  type IllustrationSources,
  type UniversalAsset,
} from '@ggraphic/editor/utils/canvasAssets';
import {
  isShareSrc,
  SHAREPIC_EMOJI,
  sharepicEmojiCode,
  SYSTEM_STICKERS,
  type SharepicEmoji,
} from '@gruenerator/contracts';

import { ALL_ASSETS, TEMPLATE_ASSETS } from './grueneAssets';

export { registerAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';

const EMOJI_NAMES: Record<SharepicEmoji, [label: string, ...tags: string[]]> = {
  '🗳️': ['Wahlurne', 'wahl', 'wählen', 'stimme'],
  '📰': ['Zeitung', 'presse', 'medien', 'nachrichten'],
  '🪧': ['Schild', 'demo', 'protest', 'plakat'],
  '✍️': ['Schreibende Hand', 'unterschrift', 'petition', 'schreiben'],
  '📣': ['Megafon', 'laut', 'aufruf', 'social media'],
  '📢': ['Lautsprecher', 'laut', 'ansage', 'aufruf'],
  '🤝': ['Handschlag', 'zusammenhalt', 'gemeinsam', 'verein'],
  '💚': ['Grünes Herz', 'herz', 'liebe', 'grün'],
  '❤️': ['Rotes Herz', 'herz', 'liebe'],
  '✅': ['Haken', 'ja', 'erledigt', 'check'],
  '❌': ['Kreuz', 'nein', 'falsch'],
  '👉': ['Zeigefinger', 'hinweis', 'pfeil'],
  '💪': ['Bizeps', 'stark', 'kraft'],
  '👏': ['Applaus', 'klatschen', 'danke'],
  '🧑‍🤝‍🧑': ['Menschen Hand in Hand', 'gemeinsam', 'menschen', 'solidarität'],
  '🌍': ['Erde', 'welt', 'klima', 'europa'],
  '🌱': ['Keimling', 'pflanze', 'wachstum', 'natur'],
  '🌳': ['Baum', 'wald', 'natur'],
  '🌻': ['Sonnenblume', 'blume', 'grüne'],
  '☀️': ['Sonne', 'solar', 'energie', 'sommer'],
  '💨': ['Wind', 'windkraft', 'luft'],
  '⚡': ['Blitz', 'strom', 'energie'],
  '🔥': ['Feuer', 'hitze', 'heizen'],
  '💧': ['Tropfen', 'wasser'],
  '♻️': ['Recycling', 'müll', 'kreislauf'],
  '🐝': ['Biene', 'artenschutz', 'natur', 'tiere'],
  '🚲': ['Fahrrad', 'rad', 'verkehr'],
  '🚆': ['Zug', 'bahn', 'verkehr'],
  '🚌': ['Bus', 'öffis', 'verkehr'],
  '🏠': ['Haus', 'wohnen', 'miete'],
  '🏫': ['Schule', 'bildung'],
  '🏥': ['Krankenhaus', 'gesundheit', 'pflege'],
  '💶': ['Euro-Schein', 'geld', 'euro', 'kosten'],
  '📈': ['Diagramm steigend', 'mehr', 'wachstum'],
  '📉': ['Diagramm fallend', 'weniger', 'sinken'],
  '📅': ['Kalender', 'termin', 'datum'],
  '📍': ['Pin', 'ort', 'vor ort'],
  '📱': ['Handy', 'smartphone', 'digital'],
  '💬': ['Sprechblase', 'gespräch', 'kommentar'],
  '💡': ['Glühbirne', 'idee', 'tipp'],
  '⚖️': ['Waage', 'gerechtigkeit', 'recht'],
  '🕊️': ['Taube', 'frieden'],
  '🎓': ['Doktorhut', 'bildung', 'studium'],
  '🌈': ['Regenbogen', 'vielfalt', 'pride'],
};

/** The vendored Noto file of an emoji (`public/emoji/`, F0: stored in canvases by id). */
export const emojiCodeSrc = (code: string): string => `/emoji/emoji_u${code}.svg`;

/** The asset an emoji of a sharepic list is drawn with. */
export const emojiAssetId = (emoji: SharepicEmoji): string =>
  emojiCodeAssetId(sharepicEmojiCode(emoji));

/** Noto Emoji (Apache-2.0, `public/emoji/LICENSE`): the closed set a sharepic list may use. */
export const EMOJI_ASSETS: UniversalAsset[] = SHAREPIC_EMOJI.map((emoji) => {
  const [label, ...tags] = EMOJI_NAMES[emoji];
  return {
    id: emojiAssetId(emoji),
    src: emojiCodeSrc(sharepicEmojiCode(emoji)),
    label,
    category: 'emoji',
    tags: ['emoji', ...tags],
    audience: 'all',
  };
});

/** The shared sticker catalogue (`SYSTEM_STICKERS` in `@gruenerator/contracts`), the same set as the Profilbild. */
export const STICKER_ASSETS: UniversalAsset[] = SYSTEM_STICKERS.map((s) => ({
  id: s.id,
  src: s.src,
  label: s.label,
  category: 'sticker',
  tags: ['sticker', ...s.tags],
  audience: s.audience,
}));

export function stickerAssetsForLocale(locale: AssetAudience): UniversalAsset[] {
  return STICKER_ASSETS.filter((a) => assetMatchesLocale(a, locale));
}

/**
 * Katalog plus Vorlagen-Varianten — alles, was sich zu einer Grafik aufloesen laesst.
 * Sticker stehen zuletzt: einige teilen ihre Datei mit einer Sonnenblume, und
 * `getAssetBySrc` soll dafuer weiter die Katalog-Grafik finden.
 */
/**
 * The illustration sets under `public/illustrations/`, each a lazy chunk. unDraw
 * is the Grünerator's, never the editor core's: its licence keeps it out of a
 * neutral bundle.
 */
const GRUENE_ILLUSTRATIONS: IllustrationSources = {
  basePath: '/illustrations',
  loadKawaii: () => import('../utils/illustrations/kawaii').then((m) => m.KAWAII_ILLUSTRATIONS),
  loadSvg: async () =>
    (
      await Promise.all([
        import('../utils/illustrations/opendoodles').then((m) => m.OPENDOODLES),
        import('../utils/illustrations/illlustrations').then((m) => m.ILLLUSTRATIONS),
        import('../utils/illustrations/gophers').then((m) => m.GOPHERS),
        import('../utils/illustrations/transhumans').then((m) => m.TRANSHUMANS),
        import('../utils/illustrations/humaaans').then((m) => m.HUMAAANS),
        import('../utils/illustrations/openpeeps').then((m) => m.OPENPEEPS),
        import('../utils/illustrations/undrawAll').then((m) => m.UNDRAW_ALL),
      ])
    ).flat(),
};

export const GRUENE_ASSET_CATALOG: CanvasAssetCatalog = {
  assets: [...ALL_ASSETS, ...TEMPLATE_ASSETS, ...EMOJI_ASSETS, ...STICKER_ASSETS],
  isInstanceSrc: isShareSrc,
  emojiSrc: emojiCodeSrc,
  illustrations: GRUENE_ILLUSTRATIONS,
};
