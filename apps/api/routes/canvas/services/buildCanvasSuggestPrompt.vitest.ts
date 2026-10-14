/**
 * The op planner's prompt in its two modes. The chat's sharepic_edit mode
 * carries the guards its own prompt had before #4251; the studio mode must
 * not pick them up.
 */
import {
  buildSharepicSnapshot,
  getSharepicTemplateDescriptor,
  type SharepicTemplateDescriptor,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildCanvasSuggestSystemPrompt,
  sharepicCapabilitiesView,
} from './buildCanvasSuggestPrompt.js';

const descriptorFor = (type: string): SharepicTemplateDescriptor =>
  getSharepicTemplateDescriptor(type) as SharepicTemplateDescriptor;

const chatPromptFor = (type: string, recentEditSummaries: string[] = []): string => {
  const d = descriptorFor(type);
  return buildCanvasSuggestSystemPrompt(
    buildSharepicSnapshot(d, d.defaultState),
    sharepicCapabilitiesView(d),
    undefined,
    null,
    { recentEditSummaries }
  );
};

describe('sharepic edit reply guard', () => {
  const prompt = chatPromptFor('dreizeilen');

  it('forbids inventing concrete numeric values in the reply', () => {
    expect(prompt).toMatch(/KEINE konkreten Zahlenwerte/);
    // The exact "80px" anti-example from the live bug must be named.
    expect(prompt).toMatch(/80px/);
  });

  it('treats quote layouts as editable campaign drafts', () => {
    expect(prompt).toContain('Vorlagenname "Zitat"');
    expect(prompt).toContain('Verlange dafür keinen fertigen Ersatztext');
    expect(prompt).toContain('vollständigen überarbeiteten Text als set-text-Operation');
    expect(prompt).toContain('belegten Wortlaut gilt');
  });

  it('asks for a version label and a short chat reply, and allows a reasoned empty batch', () => {
    expect(prompt).toMatch(/"reply"/);
    expect(prompt).toMatch(/"summary"/);
    expect(prompt).toContain('"operations": [] zurück und erkläre in "reply"');
  });

  // Creation is guarded by SHAREPIC_SAFETY_RULES; without the same rules here a
  // benign quote card could be edited into an attribution to a real politician.
  it('carries the content rules the creation path has', () => {
    expect(prompt).toContain('real existierenden Person');
    expect(prompt).toContain('herabsetzen');
    expect(prompt).toContain('setze sie NICHT um');
  });

  it('names the recent edits for pronoun context', () => {
    expect(chatPromptFor('dreizeilen', ['Zeile 2 gekürzt'])).toContain('- Zeile 2 gekürzt');
  });
});

describe('austrian templates get austrian framing', () => {
  it('names the Austrian party for an AT template', () => {
    const prompt = chatPromptFor('info-at');
    expect(prompt).toContain('österreichischen Grünen');
    expect(prompt).not.toContain('deutschen Grünen');
    expect(prompt).toContain('Nationalrat');
  });

  it('leaves the German templates untouched', () => {
    const prompt = chatPromptFor('info');
    expect(prompt).toContain('deutschen Grünen');
    expect(prompt).not.toContain('Nationalrat');
  });
});

describe('the capability view comes from the descriptor', () => {
  it('states the real font-size ranges and leaves out fields that take none', () => {
    const accent = descriptorFor('info-at').textFields.find((f) => f.field === 'accent');
    expect(accent, 'accent must still be editable as text').toBeDefined();
    expect(accent?.fontSize).toBeUndefined();
    const prompt = chatPromptFor('info-at');
    expect(prompt).toContain('set-font-size');
    expect(prompt).not.toMatch(/accent: \d+–\d+px/);
    expect(chatPromptFor('dreizeilen')).toContain('line1: 30–120px');
    expect(chatPromptFor('dreizeilen')).not.toContain('integer 1..500');
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
    expect(chatPromptFor('zitat')).not.toContain('"kind": "set-background-image"');
    // The generic photo template does allow it.
    expect(chatPromptFor('simple')).toContain('"kind": "set-background-image"');
  });

  it('names element ids with their real bounds, and the bar offset direction', () => {
    const prompt = chatPromptFor('dreizeilen');
    expect(prompt).toContain(
      'elementId "balken" (Text-Balken (drei Zeilen)): x -300..300, y -300..300, scale 0.5–2, opacity 0.2–1 (0 = unsichtbar). Negative y = nach oben.'
    );
    // The studio's generic patch list (colour, rotation, scale as a factor) does not apply here.
    expect(prompt).not.toContain('"rotation": Grad');
  });

  it('allows only the fixed background palette', () => {
    const prompt = chatPromptFor('zitat-pure');
    expect(prompt).toContain('set-background-color nimmt NUR diese Werte');
    expect(prompt).not.toContain('Lila #6F2DA8');
  });

  // The catalog used to list only what WORKS, which reads as an offer rather
  // than a boundary: dreizeilen-overlay-at was handed a `set-background-color`
  // it cannot do, the validator dropped it, and the chat reported the new
  // background anyway. Naming the limits — and the studio — is the fix.
  describe('template limits', () => {
    it('names that the template has limits at all', () => {
      const prompt = chatPromptFor('dreizeilen');
      expect(prompt).toContain('GRENZEN DIESER VORLAGE');
      expect(prompt).toMatch(/Layout, Anordnung/);
    });

    it('points at the studio for anything beyond the catalog', () => {
      expect(chatPromptFor('dreizeilen')).toMatch(/Studio/);
    });

    it('forbids confirming what no operation covered', () => {
      expect(chatPromptFor('dreizeilen')).toMatch(/Bestätige NIE etwas/);
    });

    it('lists a missing capability by its user-facing name, not its op kind', () => {
      const zitat = descriptorFor('zitat');
      // Guard the premise — if the template ever gains the op, this case is moot.
      expect(zitat.supportedOperations).not.toContain('set-background-image');
      expect(chatPromptFor('zitat')).toContain('das Hintergrundbild austauschen');
    });
  });
});

describe('the studio planner keeps its own prompt', () => {
  const prompt = buildCanvasSuggestSystemPrompt(
    {
      template: 'freeform',
      textFields: [{ field: 'headline', label: 'Headline', value: 'Alt' }],
      elementsSummary: [],
    },
    { supportedOperations: ['set-text', 'set-font-size', 'update-element'] }
  );

  it('asks for a titled, non-empty batch, with no chat reply or decline', () => {
    expect(prompt).toContain('"title"');
    expect(prompt).not.toMatch(/"reply"/);
    expect(prompt).not.toContain('"operations": []');
    expect(prompt).not.toContain('GRENZEN DIESER VORLAGE');
  });

  it('keeps the generic size and patch schemas', () => {
    expect(prompt).toContain('integer 1..500');
    expect(prompt).toContain('"rotation": Grad');
  });
});
