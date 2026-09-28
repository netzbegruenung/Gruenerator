/**
 * The composer's switch group.
 *
 * `COMPOSER_TOOLS` existed for a long time with no renderer at all: the store's
 * `toggleTool` had no caller, mobile deleted its switches as "drift", and the
 * `enabledTools` field kept travelling the wire with whatever the defaults were.
 * These tests hold the two ends together — the registry says what the rows are,
 * and every row must be something a renderer can actually act on.
 */

import { isModelEnabledByDefault, TEXT_MODELS } from '@gruenerator/shared/models';
import { describe, expect, it } from 'vitest';

import {
  COMPOSER_MODES,
  COMPOSER_TOOLS,
  composerModeDef,
  enabledModelIdsFromPreferences,
  visibleComposerModels,
} from './composerControls';
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

  it('names the role-less mode the way web and the settings do', () => {
    // Mobile said „Chat", web „Ohne Rolle" for the same mode (#3770).
    expect(composerModeDef('chat').label).toBe('Ohne Rolle');
    expect(composerModeDef('eigener').label).toBe('Eigener Chat');
  });
});

describe('visibleComposerModels', () => {
  it('falls back to the catalog defaults while preferences are unknown', () => {
    const ids = visibleComposerModels(null).map((m) => m.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(TEXT_MODELS.filter((m) => isModelEnabledByDefault(m.id)).map((m) => m.id));
  });

  it('shows exactly the models the user enabled, including off-by-default ones', () => {
    const offByDefault = TEXT_MODELS.find((m) => !isModelEnabledByDefault(m.id));
    const chosen = new Set([TEXT_MODELS[0].id, ...(offByDefault ? [offByDefault.id] : [])]);
    expect(visibleComposerModels(chosen).map((m) => m.id)).toEqual(
      TEXT_MODELS.filter((m) => chosen.has(m.id)).map((m) => m.id)
    );
  });
});

describe('enabledModelIdsFromPreferences', () => {
  it('keeps only enabled entries', () => {
    const ids = enabledModelIdsFromPreferences({
      'gruenerator-small': { enabled: true },
      'gruenerator-ultra': { enabled: false },
    });
    expect([...ids]).toEqual(['gruenerator-small']);
  });
});
