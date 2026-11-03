import { type MarketplaceItem } from '@gruenerator/contracts';

/**
 * Entries that exist only as files (`MarketplaceCollection.samples`): not rows,
 * so nobody can like, save or report them, and the web client opens their
 * picture instead of a detail. Their refs start with `muster-`. No collection
 * carries any right now; the mechanism stays for the next one.
 */
const SAMPLE_REF_PREFIX = 'muster-';

/** Entries that exist only as files: no likes, no saving, no detail page. */
export function isSampleItem(item: Pick<MarketplaceItem, 'ref'>): boolean {
  return item.ref.startsWith(SAMPLE_REF_PREFIX);
}

/** The picture a sample entry opens instead of a detail. */
export function sampleImageOf(item: MarketplaceItem): string | null {
  if (item.kind === 'template') return item.template.images[0]?.url ?? item.thumbnailUrl;
  if (item.kind === 'sticker' || item.kind === 'background') return item.asset.src;
  return null;
}
