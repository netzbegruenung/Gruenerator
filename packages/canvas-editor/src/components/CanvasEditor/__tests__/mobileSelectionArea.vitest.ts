import { describe, expect, it } from 'vitest';

import { getMobileSelectionArea } from '../mobileSelectionArea';

import type { SidebarTabId } from '../../../sidebar/types';

const UNIFIED: SidebarTabId[] = ['background', 'text', 'elements', 'tools', 'uploads', 'chat'];
const LEGACY: SidebarTabId[] = ['image-background', 'text', 'assets', 'tools', 'uploads', 'chat'];

describe('getMobileSelectionArea', () => {
  it.each([
    ['text', UNIFIED, 'text'],
    ['shape', UNIFIED, 'elements'],
    ['icon', UNIFIED, 'elements'],
    ['frame', UNIFIED, 'elements'],
    ['background', UNIFIED, 'background'],
    ['user-image', UNIFIED, 'uploads'],
    ['shape', LEGACY, 'assets'],
    ['background', LEGACY, 'image-background'],
    ['image', LEGACY, 'image-background'],
  ] as const)('%s in %j → %s', (type, tabs, expected) => {
    expect(getMobileSelectionArea(type, tabs)).toBe(expected);
  });

  it('returns null without a selection or a fitting tab', () => {
    expect(getMobileSelectionArea(null, UNIFIED)).toBeNull();
    expect(getMobileSelectionArea('text', ['background', 'uploads'])).toBeNull();
  });
});
