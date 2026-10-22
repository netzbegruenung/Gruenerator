import { configureAxe } from 'vitest-axe';

/**
 * jsdom-appropriate axe runner for the dom lane. Import this instead of `axe`
 * from 'vitest-axe': color-contrast needs real layout, which jsdom lacks, so the
 * rule only produces noise here. Contrast is checked in a real browser instead.
 *
 * Mirrors `apps/web/src/test-utils.tsx` and `packages/chat/src/test-utils.ts`,
 * deliberately duplicated rather than imported across the package boundary.
 */
export const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } });
