// SPDX-License-Identifier: MPL-2.0
/**
 * TEST-ONLY version 2 of the canvas document, to drive the migration pipeline
 * end to end. Nothing in production registers these steps; the core ships at
 * version 1 with no steps.
 *
 * - core v1 → v2: a page's `backgroundColor` moves into `background.color`.
 * - host kind `stampInstances` v1 → v2: a stamp's `offset` becomes `position`.
 *
 * Both are pure, deterministic and idempotent: applied to their own output
 * they change nothing.
 */
import {
  mapPages,
  type CanvasPage,
  type CoreMigration,
  type StateKeyMigration,
} from '../migrations.js';

const moveBackgroundColor = (page: CanvasPage): CanvasPage => {
  if (!Object.hasOwn(page.state, 'backgroundColor')) return page;
  const { backgroundColor, ...rest } = page.state;
  return { ...page, state: { ...rest, background: { color: backgroundColor } } };
};

export const V2_CORE_STEP: CoreMigration = {
  from: 1,
  migrate: (doc) => mapPages(doc, moveBackgroundColor),
};

export const STAMP_STATE_KEY = 'stampInstances';

export const STAMP_V2_STEP: StateKeyMigration = {
  from: 1,
  migrate: (list) =>
    Array.isArray(list)
      ? list.map((item: unknown) => {
          if (typeof item !== 'object' || item === null || !('offset' in item)) return item;
          const { offset, ...rest } = item as Record<string, unknown>;
          return { ...rest, position: offset };
        })
      : list,
};
