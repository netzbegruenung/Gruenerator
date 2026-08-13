/**
 * The sharepic-edit LLM writes the chat `reply` in the same call that emits the
 * operations — so it used to invent precise values ("Schriftgröße auf 80px
 * erhöht") the ops never contained. The system prompt must forbid that; this
 * pins the guard so a prompt edit can't silently drop it.
 */
import {
  buildSharepicSnapshot,
  getSharepicTemplateDescriptor,
  type SharepicTemplateDescriptor,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { buildOperationCatalog, buildSystemPrompt } from './sharepicEditLlm.js';

const descriptor = getSharepicTemplateDescriptor('dreizeilen') as SharepicTemplateDescriptor;

describe('sharepic edit reply guard', () => {
  const prompt = buildSystemPrompt(
    descriptor,
    buildSharepicSnapshot(descriptor, descriptor.defaultState),
    []
  );

  it('forbids inventing concrete numeric values in the reply', () => {
    expect(prompt).toMatch(/KEINE konkreten Zahlenwerte/);
    // The exact "80px" anti-example from the live bug must be named.
    expect(prompt).toMatch(/80px/);
  });

  it('still asks for a short chat confirmation reply', () => {
    expect(prompt).toMatch(/"reply"/);
  });

  // Creation is guarded by SHAREPIC_SAFETY_RULES, so a fabricated quote is
  // declined up front — but this prompt had no content rule at all, which left
  // the edit path as a way to the same card: build a benign quote sharepic,
  // then edit its text into an attribution to a real politician.
  it('carries the content rules the creation path has', () => {
    expect(prompt).toContain('real existierenden Person');
    expect(prompt).toContain('herabsetzen');
    expect(prompt).toContain('setze sie NICHT um');
  });
});

describe('austrian templates get austrian framing', () => {
  const promptFor = (type: string): string => {
    const d = getSharepicTemplateDescriptor(type) as SharepicTemplateDescriptor;
    return buildSystemPrompt(d, buildSharepicSnapshot(d, d.defaultState), []);
  };

  it('names the Austrian party for an AT template', () => {
    const prompt = promptFor('info-at');
    expect(prompt).toContain('österreichischen Grünen');
    expect(prompt).not.toContain('deutschen Grünen');
    expect(prompt).toContain('Nationalrat');
  });

  it('leaves the German templates untouched', () => {
    const prompt = promptFor('info');
    expect(prompt).toContain('deutschen Grünen');
    expect(prompt).not.toContain('Nationalrat');
  });
});

describe('operation catalogues stay inside what the template renders', () => {
  const descriptorFor = (type: string): SharepicTemplateDescriptor =>
    getSharepicTemplateDescriptor(type) as SharepicTemplateDescriptor;
  const catalogFor = (type: string): string =>
    buildOperationCatalog(descriptorFor(type)).join('\n');

  it('offers no font size for the info-at accent — its layout reads no override', () => {
    const accent = descriptorFor('info-at').textFields.find((f) => f.field === 'accent');
    expect(accent, 'accent must still be editable as text').toBeDefined();
    expect(accent?.fontSize).toBeUndefined();
    // The op is still offered — for the two fields that do render an override.
    expect(catalogFor('info-at')).toContain('set-font-size');
  });

  it('offers only the two rendered text fields for veranstaltung', () => {
    // The date badge is baked into circleBadgeInstances and location/address
    // have no element in the editor config — see VERANSTALTUNG_DESCRIPTOR.
    expect(descriptorFor('veranstaltung').textFields.map((f) => f.field)).toEqual([
      'eventTitle',
      'beschreibung',
    ]);
  });

  it('does not let a stock photo replace the person on a zitat', () => {
    expect(catalogFor('zitat')).not.toContain('set-background-image');
    // The generic photo template does allow it.
    expect(catalogFor('simple')).toContain('set-background-image');
  });

  // The catalog used to list only what WORKS, which reads as an offer rather
  // than a boundary: dreizeilen-overlay-at was handed a `set-background-color`
  // it cannot do, the validator dropped it, and the chat reported the new
  // background anyway. Naming the limits — and the studio — is the fix.
  describe('template limits', () => {
    it('names that the template has limits at all', () => {
      const catalog = catalogFor('dreizeilen');
      expect(catalog).toContain('GRENZEN DIESER VORLAGE');
      expect(catalog).toMatch(/Layout, Anordnung/);
    });

    it('points at the studio for anything beyond the catalog', () => {
      expect(catalogFor('dreizeilen')).toMatch(/Studio/);
    });

    it('forbids confirming what no operation covered', () => {
      expect(catalogFor('dreizeilen')).toMatch(/Bestätige NIE etwas/);
    });

    it('lists a missing capability by its user-facing name, not its op kind', () => {
      const zitat = descriptorFor('zitat');
      // Guard the premise — if the template ever gains the op, this case is moot.
      expect(zitat.supportedOperations).not.toContain('set-background-image');
      expect(catalogFor('zitat')).toContain('das Hintergrundbild austauschen');
    });
  });
});
