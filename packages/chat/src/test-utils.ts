import { configureAxe } from 'vitest-axe';

/**
 * Stricter `label` rule: axe accepts a non-empty `placeholder` as the name of a
 * form field (check `non-empty-placeholder`), so an input labelled only by its
 * hint text passes. WCAG 2.2 SC 3.3.2 / 4.1.2 and `docs/CLAUDE-a11y.md` do not:
 * the hint vanishes on input and is often too short to say what the field is
 * for (#5530 — the chat composer). Only the `label` rule uses this check.
 * Mirrored in the other `test-utils` and in `apps/web/tests/e2e/a11y.spec.ts`.
 */
const PLACEHOLDER_IS_NO_LABEL = {
  checks: [{ id: 'non-empty-placeholder', enabled: false }],
};

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
export const axe = configureAxe({
  globalOptions: PLACEHOLDER_IS_NO_LABEL,
  rules: { 'color-contrast': { enabled: false } },
});
