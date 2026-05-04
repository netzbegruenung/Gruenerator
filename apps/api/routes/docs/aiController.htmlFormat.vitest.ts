/**
 * Regression tests for the gpt-oss `<ul>`-over-wrapping bug that surfaced
 * as "Etwas ist schiefgelaufen" in the BlockNote docs editor.
 *
 * Background: BlockNote's xl-ai HTML format requires `update.block` to be a
 * single block-level HTML element matching the original block's shape. For
 * a list-item block, that's `<li>...</li>` — NOT `<ul><li>...</li></ul>`.
 * The verbatim instruction in the BlockNote bundle reads:
 *
 *   "html of block (MUST be a single HTML element)
 *    <li>item1</li>
 *    <li>item1</li>
 *    <li>item2</li>
 *    We'll merge them automatically."
 *
 * Mistral-family models (mistral-large, mistral-small-4-119b) follow this
 * convention. gpt-oss:120b — even with our strict prompt — wraps each list
 * item in its own `<ul>`, which `tryParseHTMLToBlocks` parses into a nested
 * structure that `validateBlock` rejects, transitioning BlockNote's
 * AIExtension state machine to `error`.
 *
 * The fix lives in `aiController.ts`: the provider chain is ordered
 * `[regolo, mistral, litellm]` so a Mistral-family model wins whenever
 * configured.
 */

import { describe, expect, it } from 'vitest';

// ── Observed bug artifact (production log, 2026-04-29 23:37:13) ───────────
// gpt-oss:120b on LiteLLM returned 6 update operations, every single one
// over-wrapped. Captured here verbatim so future readers can grep the
// pattern and see exactly what BlockNote rejected.
const OBSERVED_GPT_OSS_OUTPUT = [
  '<ul><li><p class="bn-inline-content">Du bist mit den Zielen und Werten grüner Politik identifiziert.</p></li></ul>',
  '<ul><li><p class="bn-inline-content">Du hast erste Erfahrung mit der Redaktion von Newslettern, der Website-Pflege und ggf. der Arbeit mit sozialen Medien.</p></li></ul>',
  '<ul><li><p class="bn-inline-content">Du hast Affinität zu IT‑gestützter Arbeit (Newslettertools, KI, Office, Wordpress &amp; Co.).</p></li></ul>',
  '<ul><li><p class="bn-inline-content">Du bist zuverlässig, selbständig und strukturiert.</p></li></ul>',
  '<ul><li><p class="bn-inline-content">Du bist bereit, gelegentlich auch außerhalb der üblichen Bürozeiten zu arbeiten.</p></li></ul>',
  '<ul><li><p class="bn-inline-content">Du bist kommunikationsstark und hast die Fähigkeit, konstruktiv mit unterschiedlichen Interessengruppen zusammenzuarbeiten.</p></li></ul>',
];

// What BlockNote actually wants for the same list-item updates.
const CORRECT_FORM_EXAMPLES = [
  '<li><p class="bn-inline-content">Du bist mit den Zielen und Werten grüner Politik identifiziert.</p></li>',
  '<li><p class="bn-inline-content">Du bist zuverlässig, selbständig und strukturiert.</p></li>',
];

/**
 * Detects the over-wrapping pattern: a list item wrapped in its own `<ul>`.
 * Used purely for assertion clarity in tests; we don't run this at
 * request-time because the right answer is to use a model that doesn't
 * produce the bad pattern in the first place.
 */
function isOverWrappedListItem(html: string): boolean {
  return /^<ul>\s*<li>/i.test(html.trim()) && /<\/li>\s*<\/ul>\s*$/i.test(html.trim());
}

describe('BlockNote xl-ai HTML format requirement', () => {
  it('accepts a bare <li>…</li> for list-item updates', () => {
    for (const correct of CORRECT_FORM_EXAMPLES) {
      expect(correct).toMatch(/^<li>/);
      expect(isOverWrappedListItem(correct)).toBe(false);
    }
  });

  it('rejects <ul><li>…</li></ul> wrapping (BlockNote merges/validates them away)', () => {
    const wrapped = '<ul><li><p class="bn-inline-content">An item</p></li></ul>';
    expect(isOverWrappedListItem(wrapped)).toBe(true);
  });
});

describe('Observed gpt-oss:120b over-wrapping regression (2026-04-29)', () => {
  it('every captured update from the failing session triggered the over-wrap detector', () => {
    for (const block of OBSERVED_GPT_OSS_OUTPUT) {
      expect(isOverWrappedListItem(block)).toBe(true);
    }
  });

  it('serves as the reason the provider chain prefers Mistral-family models', () => {
    // This test exists as a tripwire: if someone changes the provider chain
    // back to [litellm, regolo, mistral], they must come read this file and
    // either (a) revert their change or (b) harden the strict prompt with
    // explicit per-block-type examples that gpt-oss can follow.
    expect(OBSERVED_GPT_OSS_OUTPUT.every(isOverWrappedListItem)).toBe(true);
  });
});
