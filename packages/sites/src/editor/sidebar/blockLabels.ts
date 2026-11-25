import { type SiteBlock } from '@gruenerator/contracts';

import { SITE_BLOCK_UI } from '../blockUi';

/**
 * The name of each block on the page: its type's label, numbered from the second block of the
 * same type on ("Themen", "Themen 2"), so a screen reader and the list tell them apart.
 */
export function blockLabels(
  blocks: readonly Pick<SiteBlock, 'id' | 'type'>[]
): Map<string, string> {
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const block of blocks) {
    const n = (seen.get(block.type) ?? 0) + 1;
    seen.set(block.type, n);
    const label = SITE_BLOCK_UI[block.type].label;
    labels.set(block.id, n === 1 ? label : `${label} ${n}`);
  }
  return labels;
}
