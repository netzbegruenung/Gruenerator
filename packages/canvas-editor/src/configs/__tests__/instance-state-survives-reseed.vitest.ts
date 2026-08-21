import { describe, expect, it } from 'vitest';

import { loadCanvasConfig } from '../configLoader';
import { CARRIED_INSTANCE_KEYS } from '../factory/carryInstanceState';

/**
 * Guard for the "re-seed wipes the canvas" class.
 *
 * `createInitialState` is not only the mint seed. Card renders and the
 * remote-sync re-seed (`GenericCanvas.handleRemotePageState`) push the full
 * previous state back through it. Every config used to hard-set the element
 * collections to `[]`, so a single chat edit erased every icon, shape,
 * illustration, badge, frame, chart, uploaded image and additional text the
 * user had put on the canvas — silently, with no way to undo from the chat.
 *
 * Two templates derive one collection from their own text fields (the slider
 * pill from `label`, the event date circle from weekday/date/time). Those must
 * still follow the text, which is why they get their own cases below: keep the
 * instance, refresh only what the text owns.
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

/** Collections a template legitimately rebuilds from its own text fields. */
const DERIVED: Partial<Record<CanvasConfigType, string[]>> = {
  slider: ['pillBadgeInstances'],
};

/** One recognisable entry per collection, shaped enough to be told apart. */
function seedFor(key: string): unknown {
  if (key === 'selectedIcons') return ['guard-icon'];
  if (key === 'iconStates') {
    return { 'guard-icon': { x: 11, y: 22, scale: 1, rotation: 0, opacity: 0.5 } };
  }
  return [{ id: `guard-${key}`, x: 33, y: 44 }];
}

describe('user-added instances survive createInitialState', () => {
  for (const type of TEMPLATES) {
    it(`${type} keeps every collection it is handed`, async () => {
      const config = await loadCanvasConfig(type);
      const derived = DERIVED[type] ?? [];
      const seed: Record<string, unknown> = {};
      for (const key of CARRIED_INSTANCE_KEYS) {
        seed[key] = seedFor(key);
      }

      const state = config.createInitialState(seed) as Record<string, unknown>;

      const dropped = CARRIED_INSTANCE_KEYS.filter(
        (key) => !derived.includes(key) && JSON.stringify(state[key]) !== JSON.stringify(seed[key])
      );
      expect(dropped, `${type} dropped: ${dropped.join(', ')}`).toEqual([]);
    });
  }
});

describe('derived collections keep the instance and refresh only the text', () => {
  it('slider pill keeps id and position, follows the label', async () => {
    const config = await loadCanvasConfig('slider');
    const pill = {
      id: 'slider-label-pill',
      text: 'Alt',
      x: 123,
      y: 456,
      scale: 1.4,
      opacity: 0.6,
    };

    const state = config.createInitialState({
      slideVariant: 'cover',
      label: 'Neu aus dem Chat',
      pillBadgeInstances: [pill],
    }) as Record<string, unknown>;

    const [result] = state.pillBadgeInstances as Array<Record<string, unknown>>;
    expect(result.id).toBe('slider-label-pill');
    expect(result.x).toBe(123);
    expect(result.y).toBe(456);
    expect(result.scale).toBe(1.4);
    expect(result.opacity).toBe(0.6);
    expect(result.text).toBe('Neu aus dem Chat');
  });

  it('slider mints a pill for a cover slide that has none', async () => {
    const config = await loadCanvasConfig('slider');
    const state = config.createInitialState({
      slideVariant: 'cover',
      label: 'Wusstest du?',
    }) as Record<string, unknown>;

    expect((state.pillBadgeInstances as unknown[]).length).toBe(1);
  });

  it('slider leaves a lone hand-added pill alone when the label pill is gone', async () => {
    const config = await loadCanvasConfig('slider');
    const own = { id: 'pill-badge-1700000000-1', text: 'Meine Pille', x: 700, y: 900 };

    const state = config.createInitialState({
      slideVariant: 'cover',
      label: 'Neu aus dem Chat',
      pillBadgeInstances: [own],
    }) as Record<string, unknown>;

    expect(state.pillBadgeInstances).toEqual([own]);
  });

  it('slider refreshes only the label pill, never its neighbours', async () => {
    const config = await loadCanvasConfig('slider');
    const own = { id: 'pill-badge-1700000000-2', text: 'Meine Pille', x: 700, y: 900 };
    const label = { id: 'slider-label-pill', text: 'Alt', x: 80, y: 120 };

    const state = config.createInitialState({
      slideVariant: 'cover',
      label: 'Neu aus dem Chat',
      pillBadgeInstances: [own, label],
    }) as Record<string, unknown>;

    const badges = state.pillBadgeInstances as Array<Record<string, unknown>>;
    expect(badges[0]).toEqual(own);
    expect(badges[1].text).toBe('Neu aus dem Chat');
  });

  it('a minted label pill carries the stable id', async () => {
    const config = await loadCanvasConfig('slider');
    const state = config.createInitialState({
      slideVariant: 'cover',
      label: 'Wusstest du?',
    }) as Record<string, unknown>;

    const [minted] = state.pillBadgeInstances as Array<Record<string, unknown>>;
    expect(minted.id).toBe('slider-label-pill');
  });

  it('veranstaltung date circle keeps its placement, follows the date', async () => {
    const config = await loadCanvasConfig('veranstaltung');
    const badge = {
      id: 'date-circle',
      x: 200,
      y: 300,
      radius: 90,
      scale: 1.2,
      opacity: 0.8,
      textLines: [{ text: 'ALT' }],
    };

    const state = config.createInitialState({
      weekday: 'Freitag',
      date: '31.10.',
      time: '19:00',
      circleBadgeInstances: [badge],
    }) as Record<string, unknown>;

    const [result] = state.circleBadgeInstances as Array<Record<string, unknown>>;
    expect(result.x).toBe(200);
    expect(result.y).toBe(300);
    expect(result.scale).toBe(1.2);
    expect(result.opacity).toBe(0.8);
    expect(JSON.stringify(result.textLines)).toContain('Freitag');
  });

  it('veranstaltung leaves other circle badges alone', async () => {
    const config = await loadCanvasConfig('veranstaltung');
    const own = { id: 'mine', x: 10, y: 20, textLines: [{ text: 'Meins' }] };

    const state = config.createInitialState({
      weekday: 'Freitag',
      date: '31.10.',
      time: '19:00',
      circleBadgeInstances: [{ id: 'date-circle', x: 1, y: 2, textLines: [] }, own],
    }) as Record<string, unknown>;

    const badges = state.circleBadgeInstances as Array<Record<string, unknown>>;
    expect(badges).toHaveLength(2);
    expect(badges[1]).toEqual(own);
  });
});
