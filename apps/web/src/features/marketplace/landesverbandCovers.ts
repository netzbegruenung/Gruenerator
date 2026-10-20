import { type MarketplaceCollectionCover } from '@gruenerator/shared/marketplace';

const DIR = '/images/marketplace/landesverbaende';

/**
 * Each photo ships in two cuts, so no screen downloads more than it shows:
 * a 3:4 crop for the row (208 px wide: 320 for 1x, 480 for 2x) and a 3:1
 * strip for the page banner, up to 2400 so a wide Retina screen stays sharp.
 */
export const lvCardImage = (cover: MarketplaceCollectionCover) => ({
  src: `${DIR}/${cover.file}-card-320.webp`,
  srcSet: `${DIR}/${cover.file}-card-320.webp 320w, ${DIR}/${cover.file}-card-480.webp 480w`,
  sizes: '208px',
});

export const lvBannerImage = (cover: MarketplaceCollectionCover) => ({
  src: `${DIR}/${cover.file}-640.webp`,
  srcSet: [640, 1200, 1920, 2400].map((w) => `${DIR}/${cover.file}-${w}.webp ${w}w`).join(', '),
  sizes: '(min-width: 1280px) 1200px, 100vw',
});
