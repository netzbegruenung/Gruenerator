// SPDX-License-Identifier: MPL-2.0
/**
 * A probe host element kind for the core's tests: a stamp placed by an
 * `offset` from a layout point instead of x/y, with a label it edits in its
 * own text editor. The core declares no host kind, so the registration goes
 * past the types; each test file registers it for itself (`registerStampKind`).
 */
import { registerElementKind, type ElementKindRegistration } from '../utils/elementKinds.js';

import type { OrientationPatch } from '../utils/orientElement.js';

export interface Stamp {
  id: string;
  label: string;
  offset: { x: number; y: number };
  rotation?: number;
  opacity?: number;
}

export const STAMP_KIND = {
  kind: 'stamp',
  stateKey: 'stampInstances',
  actions: { update: 'updateStamp', remove: 'removeStamp' },
  add: { action: 'addStamp', args: (payload: { label: string }) => [payload.label] },
  name: () => 'Stempel',
  layerContent: (d: Stamp) => d.label,
  duplicate: (d: Stamp, id: string, o: { x: number; y: number }) => ({
    ...d,
    id,
    offset: { x: d.offset.x + o.x, y: d.offset.y + o.y },
  }),
  // Turns about its centre; a move lands in the offset, never in x/y.
  orient: (patch: OrientationPatch, d: Stamp) => ({
    ...(patch.rotation != null && { rotation: patch.rotation }),
    ...(patch.translate && {
      offset: { x: d.offset.x + patch.translate.x, y: d.offset.y + patch.translate.y },
    }),
  }),
  nudge: (d: Stamp, delta: { x: number; y: number }) => ({
    offset: { x: d.offset.x + delta.x, y: d.offset.y + delta.y },
  }),
  floating: (d: Stamp) => ({ opacity: d.opacity ?? 1 }),
  editableText: true,
  describe: (d: Stamp) => `Stempel "${d.label}"`,
  aiUpdate: {
    fields: ['x', 'y', 'opacity'],
    patch: ({ x, y, ...rest }: Record<string, unknown>, d: Stamp) => ({
      ...rest,
      ...((x != null || y != null) && {
        offset: { x: (x as number) ?? d.offset.x, y: (y as number) ?? d.offset.y },
      }),
    }),
  },
  pptx: (d: Stamp, page: { x: number; y: number; width: number; height: number }) => ({
    kind: 'raster',
    elementId: d.id,
    box: page,
    rotation: d.rotation ?? 0,
    reason: 'stamp',
    boxExact: false,
  }),
  pageStateKeys: ['stampColour'],
  layoutStateKeys: ['stampColour'],
} as const;

export function registerStampKind(): void {
  registerElementKind(STAMP_KIND as unknown as ElementKindRegistration<never>);
}
