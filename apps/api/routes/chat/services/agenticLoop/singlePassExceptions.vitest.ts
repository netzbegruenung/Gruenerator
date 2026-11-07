import { describe, expect, it } from 'vitest';

import {
  decideRunAgentic,
  keepsSinglePass,
  type AgenticDecisionInput,
  type SinglePassReason,
} from './routing.js';

// Eine Regel: ein Prosa-Turn geht in den Loop, es sei denn, ein ZUSTAND hält ihn
// draussen. Jeder Fall unten setzt genau einen Zustand und lässt den Text neutral.
const AGENTIC = new Set(['agentic', 'search', 'web']);
const base: AgenticDecisionInput = {
  loopEnabled: true,
  agenticIntents: AGENTIC,
  intent: 'produktion',
  lastUserText: 'Schreib einen Absatz für die Website.',
  forcedTool: false,
  mustLoop: false,
  forcedLoop: false,
  isCompound: false,
  hasSelectedNotebook: false,
  secondaryIntent: null,
  compoundGeneration: false,
  hasImageAttachments: false,
  isPdfFillRequest: false,
};
const decide = (o: Partial<AgenticDecisionInput>) => decideRunAgentic({ ...base, ...o });
const reason = (o: Partial<AgenticDecisionInput>) => keepsSinglePass({ ...base, ...o });

describe('keepsSinglePass — jeder Grund hält einen Prosa-Turn draussen', () => {
  const cases: [SinglePassReason, Partial<AgenticDecisionInput>][] = [
    ['greeting', { intent: 'greeting', lastUserText: 'Hallo!' }],
    ['loop_disabled', { loopEnabled: false }],
    ['pinned_tool_without_loop', { forcedTool: true, forcedLoop: false }],
    ['compound', { isCompound: true }],
    ['selected_notebook', { hasSelectedNotebook: true }],
    ['secondary_intent', { secondaryIntent: 'image' }],
    ['pixel_turn', { hasImageAttachments: true, intent: 'image' }],
    ['image_only_ask', { hasImageAttachments: true, lastUserText: 'Was steht auf dem Plakat?' }],
    [
      // Live 29.09.2026: ein eingefügter Newsletter kam zusammengefasst statt
      // korrigiert zurück, weil der Planer nach Werkzeugen griff statt zum Text.
      'reworks_own_material',
      { hasOwnMaterial: true, lastUserText: 'Kannst du das lektorieren?' },
    ],
  ];
  for (const [expected, input] of cases) {
    it(`${expected}: bleibt im Einzeldurchlauf`, () => {
      expect(reason(input)).toBe(expected);
      expect(decide(input)).toBe(false);
    });
  }
});

describe('Gegenproben — alte Textheuristiken, die jetzt in den Loop führen', () => {
  const texts: [string, string][] = [
    ['kürzer (nach einem Sharepic)', 'kürzer'],
    ['und in Bayern?', 'und in Bayern?'],
    ['Schreib ein Gedicht über Fahrräder', 'Schreib ein Gedicht über Fahrräder'],
    ['heller', 'heller'],
    ['Danke dir', 'Danke dir'],
    ['mach es blauer', 'mach es blauer'],
  ];
  for (const [name, lastUserText] of texts) {
    it(`${name} → loop`, () => {
      expect(reason({ lastUserText })).toBeNull();
      expect(decide({ lastUserText })).toBe(true);
    });
  }

  it('Material und Umschreib-Wort ohne eigenes Material bleiben im Loop', () => {
    expect(decide({ hasOwnMaterial: false, lastUserText: 'Kannst du das lektorieren?' })).toBe(
      true
    );
  });
});
