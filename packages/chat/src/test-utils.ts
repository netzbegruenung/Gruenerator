import { configureAxe } from 'vitest-axe';

/**
 * jsdom-appropriate axe runner for the dom lane. Import this instead of `axe`
 * from 'vitest-axe': color-contrast needs a canvas and real layout, which jsdom
 * has neither of, so the rule only produces "getContext not implemented" noise
 * here. Contrast is checked in a real browser instead — `apps/web/tests/e2e/
 * a11y.spec.ts`, and for colour decisions by measuring (see connectorBrand.ts).
 *
 * Mirrors `apps/web/src/test-utils.tsx`, deliberately duplicated rather than
 * imported across the package boundary — the rule is spelled out in
 * `apps/web/CLAUDE-testing.md`. No `renderWithProviders` twin here yet: the
 * components that needed one so far are plain props-in/DOM-out.
 */
export const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } });
