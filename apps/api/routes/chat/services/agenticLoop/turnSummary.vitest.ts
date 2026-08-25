/**
 * Die Zusammenfassungszeile muss den Antwort-Ersatz zeigen können.
 *
 * Anlass: der Erfolgsfall des stillen Wiederholungsversuchs war der einzige
 * stumme Pfad im Loop — `recordDecision` schreibt nur ins Entwicklungs-Journal,
 * auf Test und Produktion existierte der Eintrag also gar nicht. Übrig blieb
 * `chars=…`, und das ist bei einem Ersatz dieselbe Sorte Zahl wie bei einem
 * gewöhnlichen Zug: ein getauschter Turn war aus dem Log nicht mehr zu erkennen.
 */
import { describe, it, expect } from 'vitest';

import { logTurnSummary } from './turnSummary.js';

import type { PersistedStep } from './types.js';

function line(overrides: Partial<Parameters<typeof logTurnSummary>[0]> = {}): string {
  let out = '';
  logTurnSummary({
    modelName: 'mistral-medium-2604',
    mode: 'split',
    plannerName: 'mistral-small-3.2-24b-instruct-2506',
    synthName: 'mistral-medium-2604',
    intent: 'agentic',
    steps: [] as PersistedStep[],
    sourceCount: 0,
    carriedCount: 0,
    answerChars: 2992,
    answerReplaced: null,
    mcpMountMs: 0,
    onInfo: (m) => (out = m),
    ...overrides,
  });
  return out;
}

describe('logTurnSummary — der Antwort-Ersatz', () => {
  it('benennt den stillen Tausch, der vorher gar keine Spur hinterließ', () => {
    // Genau die Signatur des gemeldeten Ausfalls (24.08.2026, chars=2992): ohne
    // diesen Zusatz war der Ersatz nur über die Stoppuhr auszuschließen.
    expect(line({ answerReplaced: 'validation_retry' })).toContain('replaced=validation_retry');
  });

  it('unterscheidet den Tausch auf der Leitung vom stillen', () => {
    expect(line({ answerReplaced: 'validation_retry_streamed' })).toContain(
      'replaced=validation_retry_streamed'
    );
  });

  it('schweigt, wenn die erste Antwort stehen geblieben ist', () => {
    expect(line()).not.toContain('replaced=');
    expect(line()).toContain('chars=2992');
  });
});
