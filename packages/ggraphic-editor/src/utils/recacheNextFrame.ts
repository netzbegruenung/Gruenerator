// SPDX-License-Identifier: MPL-2.0
import type Konva from 'konva';

const pending = new WeakSet<Konva.Node>();

/**
 * Re-caches a filtered node once per frame at most. A pan changes the crop on
 * every pointer move, and each `cache()` re-runs every filter over the bitmap.
 */
export function recacheNextFrame(node: Konva.Node): void {
  if (!node.isCached() || pending.has(node)) return;
  pending.add(node);
  requestAnimationFrame(() => {
    pending.delete(node);
    if (node.isCached()) node.cache();
  });
}
