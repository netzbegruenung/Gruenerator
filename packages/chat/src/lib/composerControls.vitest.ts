/**
 * The composer's switch group.
 *
 * `COMPOSER_TOOLS` existed for a long time with no renderer at all: the store's
 * `toggleTool` had no caller, mobile deleted its switches as "drift", and the
 * `enabledTools` field kept travelling the wire with whatever the defaults were.
 * These tests hold the two ends together — the registry says what the rows are,
 * and every row must be something a renderer can actually act on.
 */

import { describe, expect, it } from 'vitest';

import { COMPOSER_MODES, COMPOSER_TOOLS } from './composerControls';
import { resolveMentionable } from './mentionables';

describe('COMPOSER_TOOLS', () => {
  it('offers Websuche and Dokumentensuche as sticky toggles', () => {
    const toggles = COMPOSER_TOOLS.filter((t) => t.kind === 'toggle').map((t) => t.key);
    expect(toggles).toEqual(['research', 'search']);
  });

  it('offers Tiefenrecherche as a one-shot, not a toggle', () => {
    // The distinction the old menu could not express: this applies to ONE
    // message, so it must not render a check that says otherwise.
    const deep = COMPOSER_TOOLS.find((t) => t.label === 'Tiefenrecherche');
    expect(deep?.kind).toBe('once');
  });

  it('no longer offers the corpus lookups as switches', () => {
    const keys = COMPOSER_TOOLS.filter((t) => t.kind === 'toggle').map((t) => t.key);
    expect(keys).not.toContain('examples');
    expect(keys).not.toContain('pressemitteilung_examples');
  });

  it('every one-shot row resolves to a real mentionable', () => {
    // A `once` row inserts `resolveMentionable(mention)`; an unresolvable slug
    // would render a row that silently does nothing when clicked.
    for (const tool of COMPOSER_TOOLS) {
      if (tool.kind !== 'once') continue;
      expect(resolveMentionable(tool.mention), `@${tool.mention}`).not.toBeNull();
    }
  });

  it('every row carries a label and a description', () => {
    for (const tool of COMPOSER_TOOLS) {
      expect(tool.label.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});

describe('COMPOSER_MODES', () => {
  it('no longer offers the notebook mode', () => {
    // Stillgelegt (08/2026): it dispatches to a different endpoint entirely, so
    // it never belonged beside Chat and Rolle as a peer. The TRANSPORT stays —
    // see the ThreadMode test below.
    expect(COMPOSER_MODES.map((m) => m.mode)).not.toContain('notebook');
  });

  it('still offers Chat and Eigener Chat', () => {
    expect(COMPOSER_MODES.map((m) => m.mode)).toEqual(['chat', 'eigener']);
  });
});
