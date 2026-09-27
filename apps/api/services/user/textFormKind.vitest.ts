/**
 * The single kind-derivation rule for angelernte Textformen — the logic
 * `userTextFormsContractRouter.save` and `textFormTools.createTextForm` each
 * reimplemented before this module existed.
 *
 * Run with: cd apps/api && npx vitest run services/user/textFormKind.vitest.ts
 */
import { describe, expect, it, vi } from 'vitest';

import {
  deriveRecipeMention,
  normalizeTextFormMention,
  resolveTextFormKind,
} from './textFormKind.js';

/** Die Kennungen aus der Landesverbands-Registry, wie in recipeOverrideAccess.vitest.ts. */
const BAYERN = 'bayern';
const HESSEN = 'hessen';

// `hasSystemRecipe` covers every SKILLS mention, so the defensive 409 branch
// in resolveTextFormKind (rule 4) is unreachable through it in production —
// it only guards a future divergence between SKILLS and hasSystemRecipe. To
// actually exercise that branch, one test below overrides hasSystemRecipe for
// a single call; every other test keeps the real implementation.
vi.mock('@gruenerator/shared/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gruenerator/shared/agents')>();
  return { ...actual, hasSystemRecipe: vi.fn(actual.hasSystemRecipe) };
});

import { hasSystemRecipe } from '@gruenerator/shared/agents';

describe('normalizeTextFormMention', () => {
  it('strips a leading @ or /, trims and lowercases', () => {
    expect(normalizeTextFormMention('@Presse')).toBe('presse');
    expect(normalizeTextFormMention('/Presse')).toBe('presse');
    expect(normalizeTextFormMention('  Presse  ')).toBe('presse');
  });

  it('resolves a retired mention to its successor', () => {
    expect(normalizeTextFormMention('presse-hessen')).toBe('presse-hessen-partei');
  });
});

describe('deriveRecipeMention', () => {
  it('slugifies a title and keeps umlauts', () => {
    expect(deriveRecipeMention('Meine Einladungen für Ortsverbände')).toBe(
      'meine-einladungen-für-ortsverbände'
    );
  });
});

describe('resolveTextFormKind', () => {
  it('resolves a preset mention (mention === type)', () => {
    const verdict = resolveTextFormKind({ mention: 'presse', lvIds: null });
    expect(verdict).toEqual({ ok: true, kind: 'preset', textType: 'presse', mention: 'presse' });
  });

  it('normalizes @Presse and /presse to the same preset', () => {
    for (const raw of ['@Presse', '/presse']) {
      const verdict = resolveTextFormKind({ mention: raw, lvIds: null });
      expect(verdict).toEqual({ ok: true, kind: 'preset', textType: 'presse', mention: 'presse' });
    }
  });

  it('allows an LV recipe override for a matching lvId', () => {
    const verdict = resolveTextFormKind({ mention: 'presse-bayern-partei', lvIds: [BAYERN] });
    expect(verdict).toEqual({
      ok: true,
      kind: 'recipe',
      textType: null,
      mention: 'presse-bayern-partei',
    });
  });

  it('rejects an LV recipe override for a foreign LV with 403', () => {
    const verdict = resolveTextFormKind({ mention: 'presse-hessen-partei', lvIds: [BAYERN] });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.status).toBe(403);
  });

  it('rejects a system recipe without a Landesverband with 400', () => {
    const verdict = resolveTextFormKind({ mention: 'wahlpruefstein', lvIds: [HESSEN] });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.status).toBe(400);
  });

  it('accepts a valid custom slug', () => {
    const verdict = resolveTextFormKind({ mention: 'mein-eigener-stil', lvIds: null });
    expect(verdict).toEqual({
      ok: true,
      kind: 'custom',
      textType: null,
      mention: 'mein-eigener-stil',
    });
  });

  it('rejects a custom mention shadowing a SKILL mention with 409', () => {
    // Forces the defensive branch: hasSystemRecipe says "no system recipe"
    // for this one call even though 'twitter' is a real SKILLS mention.
    vi.mocked(hasSystemRecipe).mockReturnValueOnce(false);
    const verdict = resolveTextFormKind({ mention: 'twitter', lvIds: null });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.status).toBe(409);
  });

  it('canonicalizes a retired mention and resolves it as a recipe override', () => {
    const verdict = resolveTextFormKind({ mention: 'presse-hessen', lvIds: [HESSEN] });
    expect(verdict).toEqual({
      ok: true,
      kind: 'recipe',
      textType: null,
      mention: 'presse-hessen-partei',
    });
  });

  it('rejects a requestedKind that contradicts the derived kind with 400', () => {
    const verdict = resolveTextFormKind({
      mention: 'presse',
      requestedKind: 'custom',
      lvIds: null,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.status).toBe(400);
    expect(verdict.ok === false && verdict.message).toContain('@presse');
    expect(verdict.ok === false && verdict.message).toContain("kind='custom'");
  });

  it('accepts a requestedKind that matches the derived kind', () => {
    const verdict = resolveTextFormKind({
      mention: 'presse',
      requestedKind: 'preset',
      lvIds: null,
    });
    expect(verdict).toEqual({ ok: true, kind: 'preset', textType: 'presse', mention: 'presse' });
  });
});
