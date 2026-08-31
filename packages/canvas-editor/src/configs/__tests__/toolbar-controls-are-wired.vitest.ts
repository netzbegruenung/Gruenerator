import { beforeAll, describe, expect, it } from 'vitest';

import { loadCanvasConfig } from '../configLoader';

/**
 * Guard for the "visible but dead control" class.
 *
 * Two different places decide about a control in the floating toolbar: whether
 * it APPEARS (`ContextControls.tsx` — colour, font size and opacity render for
 * every selected text, opacity for every element except `frame`) and whether it
 * WRITES (`useFloatingModuleHandlers.ts` / `useCanvasElementHandlers.ts` — only
 * when the element declares the matching `*StateKey`). Without the key the
 * handler falls through silently: no error, no log, just a slider that moves
 * and changes nothing.
 *
 * Second half of the guard: declaring the key is not enough. `createInitialState`
 * is a whitelist, and card renders plus remote-sync re-seeds run through it, so
 * a key that is neither carried nor listed in `passthroughStateKeys` applies
 * live and disappears on the next render.
 */

type CanvasConfigType = Parameters<typeof loadCanvasConfig>[0];

const TEMPLATES: CanvasConfigType[] = [
  'zitat-pure',
  'info',
  'veranstaltung',
  'simple',
  'dreizeilen',
  'zitat',
  'slider',
  'freeform',
  'profilbild',
  'zitat-at',
  'zitat-pure-at',
  'dreizeilen-overlay-at',
  'info-at',
  'freeform-at',
];

interface ElementLike {
  id: string;
  type: string;
  listening?: boolean;
  draggable?: boolean;
  transformable?: boolean;
  fillStateKey?: string;
  fontSizeStateKey?: string;
  opacityStateKey?: string;
  positionStateKey?: string;
  offsetKey?: string;
  scaleKey?: string;
  sizeStateKey?: string;
}

/** Elements the user can put a selection on — `frame` shows no controls at all. */
function isSelectable(el: ElementLike): boolean {
  if (el.listening === false) return false;
  return el.type === 'text' || el.type === 'image';
}

/** Sentinel values by key shape, so the round-trip can compare by value. */
function sentinelFor(key: string): unknown {
  if (/Position$|Offset$|^namePosition$/.test(key)) return { x: 17, y: 23 };
  if (/Size$/.test(key)) return { w: 41, h: 43 };
  if (/Color$/.test(key)) return '#123456';
  if (/FontSize$/.test(key)) return 42;
  if (/Scale$/.test(key)) return 1.25;
  return 0.42;
}

describe.each(TEMPLATES)('%s: toolbar controls are wired', (type) => {
  // Loaded once with its own budget: `loadCanvasConfig` pulls in the whole
  // config chain through a dynamic import, which busts the 5s default test
  // timeout on a loaded CI runner.
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(type);
  }, 60_000);

  it('every selectable element declares the keys its controls write to', () => {
    const missing: string[] = [];

    for (const raw of config.elements as ElementLike[]) {
      if (!isSelectable(raw)) continue;
      const where = `${type}/${raw.id}`;

      // Opacity renders for everything except `frame`.
      if (!raw.opacityStateKey) missing.push(`${where}: opacityStateKey`);

      if (raw.type === 'text') {
        if (!raw.fillStateKey) missing.push(`${where}: fillStateKey`);
        if (!raw.fontSizeStateKey) missing.push(`${where}: fontSizeStateKey`);
        // A text drop is only kept when an absolute position key exists —
        // `handleElementPositionChange` knows no offset path.
        if (raw.draggable && !raw.positionStateKey) missing.push(`${where}: positionStateKey`);
      }

      if (raw.type === 'image' && raw.draggable && !raw.offsetKey && !raw.positionStateKey) {
        missing.push(`${where}: offsetKey or positionStateKey`);
      }

      if (raw.type === 'image' && raw.transformable && !raw.sizeStateKey && !raw.scaleKey) {
        missing.push(`${where}: sizeStateKey or scaleKey`);
      }

      // The mirror case: `sizeStateKey` is written only by
      // `handleImageTransformEnd`, which fires only from the Transformer's
      // corner anchors — and those are enabled only for `transformable`
      // images. A size key without `transformable` is therefore a state slot
      // nothing can ever write.
      if (raw.type === 'image' && raw.sizeStateKey && !raw.transformable) {
        missing.push(`${where}: transformable (sizeStateKey has no writer)`);
      }
    }

    expect(missing, `dead controls in ${type}:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('every declared key survives createInitialState', () => {
    const keys = new Set<string>();
    for (const raw of config.elements as ElementLike[]) {
      for (const k of [
        raw.fillStateKey,
        raw.fontSizeStateKey,
        raw.opacityStateKey,
        raw.positionStateKey,
        raw.offsetKey,
        raw.scaleKey,
        raw.sizeStateKey,
      ]) {
        if (k) keys.add(k);
      }
    }

    const seed: Record<string, unknown> = {};
    for (const k of keys) seed[k] = sentinelFor(k);

    const state = config.createInitialState(seed) as Record<string, unknown>;

    const dropped = [...keys].filter((k) => {
      // Value equality, not presence: the factories used to hard-null the
      // font-size keys, and a `null` survives an "is it defined" check while
      // still throwing the edit away.
      return JSON.stringify(state[k]) !== JSON.stringify(seed[k]);
    });

    expect(dropped, `${type} drops on re-seed: ${dropped.join(', ')}`).toEqual([]);
  });
});
