import { describe, expect, it } from 'vitest';

import { getMobileSelectionArea } from '../mobileSelectionArea';

import type { FloatingModuleState } from '../../../hooks/useFloatingModuleState';
import type { SidebarTabId } from '../../../sidebar/types';

const UNIFIED: SidebarTabId[] = ['background', 'text', 'elements', 'tools', 'uploads', 'chat'];
const LEGACY: SidebarTabId[] = ['image-background', 'text', 'assets', 'tools', 'uploads', 'chat'];
const FACTORY: SidebarTabId[] = ['image', 'text', 'assets', 'tools', 'uploads', 'chat'];

const mod = (
  type: FloatingModuleState['type'],
  data: Partial<FloatingModuleState['data']> = {}
): FloatingModuleState => ({ type, data: { id: 'x', ...data } });

describe('getMobileSelectionArea', () => {
  it.each([
    ['photo', mod('image', { isPhoto: true }), UNIFIED, 'background'],
    ['photo', mod('image', { isPhoto: true }), LEGACY, 'image-background'],
    ['photo', mod('image', { isPhoto: true }), FACTORY, 'image'],
    ['background', mod('background'), UNIFIED, 'background'],
    ['illustration', mod('illustration'), UNIFIED, 'elements'],
    ['illustration', mod('illustration'), LEGACY, 'assets'],
    ['frame', mod('frame'), LEGACY, 'assets'],
  ] as const)('%s in %j → %s', (_label, module, tabs, expected) => {
    expect(getMobileSelectionArea('x', module, tabs, null)).toBe(expected);
  });

  // Their tabs are add catalogs that don't know the selection.
  it.each([
    ['decoration image', mod('image', { isPhoto: false })],
    ['text', mod('text')],
    ['shape', mod('shape')],
    ['icon', mod('icon')],
    ['asset', mod('asset')],
    ['user-image', mod('user-image')],
    ['balken without settings', mod('balken')],
    ['badge (no module)', null],
  ] as const)('%s → no area', (_label, module) => {
    expect(getMobileSelectionArea('x', module, UNIFIED, null)).toBeNull();
  });

  it("prefers the config's auto-switch target, even for hidden tabs", () => {
    expect(getMobileSelectionArea('balken-1', mod('balken'), LEGACY, 'settings')).toBe('settings');
    expect(getMobileSelectionArea('chart-1', null, UNIFIED, 'chart-settings')).toBe(
      'chart-settings'
    );
    expect(getMobileSelectionArea('frame-1', mod('frame'), UNIFIED, 'frame-settings')).toBe(
      'frame-settings'
    );
  });

  it('returns null without a selection or a fitting tab', () => {
    expect(getMobileSelectionArea(null, null, UNIFIED, null)).toBeNull();
    expect(getMobileSelectionArea('x', mod('illustration'), ['text', 'uploads'], null)).toBeNull();
  });
});
