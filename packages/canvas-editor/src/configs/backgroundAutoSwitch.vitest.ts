/**
 * Clicking the background image must open the tab that replaces it.
 *
 * The trap this guards: the obvious id to match on is `background`, and three
 * configs did exactly that — but `background` is the solid-colour plane, which
 * `CanvasBackground` renders with `listening={false}`, so the branch could never
 * fire. The clickable element is the one with id `background-image`. A test that
 * only asserted "some tab is returned" would have passed against the dead
 * branch, so each case pins the concrete tab id.
 */

import { describe, expect, it } from 'vitest';

import { dreizeilenFullConfig } from './dreizeilen_full.config';
import { freeformFullConfig } from './freeform_full.config';
import { simpleFullConfig } from './simple_full.config';

import type { FullCanvasConfig } from './types';

const CASES: ReadonlyArray<{
  name: string;
  config: Pick<FullCanvasConfig<never, never>, 'getAutoSwitchTab'>;
  expected: string;
}> = [
  // createImageTwoTextCanvas factory
  { name: 'simple', config: simpleFullConfig as never, expected: 'image' },
  { name: 'dreizeilen', config: dreizeilenFullConfig as never, expected: 'image-background' },
  { name: 'freeform', config: freeformFullConfig as never, expected: 'background' },
];

describe('getAutoSwitchTab — background image opens its tab', () => {
  it.each(CASES)('$name opens $expected', ({ config, expected }) => {
    expect(config.getAutoSwitchTab?.('background-image')).toBe(expected);
  });

  it.each(CASES)('$name leaves other elements alone', ({ config }) => {
    expect(config.getAutoSwitchTab?.('quote-text')).toBeNull();
    expect(config.getAutoSwitchTab?.(null)).toBeNull();
  });

  it('still routes chart and frame selections', () => {
    expect(freeformFullConfig.getAutoSwitchTab?.('chart-1')).toBe('chart-settings');
    expect(freeformFullConfig.getAutoSwitchTab?.('frame-1')).toBe('frame-settings');
  });
});
