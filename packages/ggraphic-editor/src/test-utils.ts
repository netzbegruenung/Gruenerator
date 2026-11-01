// SPDX-License-Identifier: MPL-2.0
import { configureAxe } from 'vitest-axe';

/**
 * jsdom-appropriate axe runner for the dom lane. Import this instead of `axe`
 * from 'vitest-axe': color-contrast needs real layout, which jsdom lacks, so the
 * rule only produces noise here. Contrast is checked in a real browser instead.
 */
export const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } });
