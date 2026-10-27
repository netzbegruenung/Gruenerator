import {
  landesverbandBannerPath,
  landesverbandCardPaths,
  type MarketplaceCollectionCover,
} from '@gruenerator/shared/marketplace';

/**
 * Each photo ships in two cuts, so no screen downloads more than it shows:
 * a 3:4 crop for the row (208 px wide: 320 for 1x, 480 for 2x) and a 3:1
 * strip for the page banner, up to 2400 so a wide Retina screen stays sharp.
 */
export const lvCardImage = (cover: MarketplaceCollectionCover) => {
  const { w320, w480 } = landesverbandCardPaths(cover);
  return { src: w320, srcSet: `${w320} 320w, ${w480} 480w`, sizes: '208px' };
};

export const lvBannerImage = (cover: MarketplaceCollectionCover) => ({
  src: landesverbandBannerPath(cover, 640),
  srcSet: ([640, 1200, 1920, 2400] as const)
    .map((w) => `${landesverbandBannerPath(cover, w)} ${w}w`)
    .join(', '),
  sizes: '(min-width: 1280px) 1200px, 100vw',
});
