import { describe, expect, it } from 'vitest';

import {
  buildConcisePromptGeneral,
  buildConcisePromptGrundsatz,
  buildDraftPromptGeneral,
  buildDraftPromptGrundsatz,
} from './prompts.js';

describe('Antrag, Änderungsantrag, Beschluss', () => {
  // Live 16.11.2026 im NRW-Notebook: ein Satz aus einem Änderungsantrag wurde
  // als Position des Landesverbands wiedergegeben.
  it('steht in den Prompts für politische Dokumente', () => {
    for (const prompt of [buildDraftPromptGrundsatz(), buildConcisePromptGrundsatz()]) {
      expect(prompt.system).toContain('## ANTRAG, ÄNDERUNGSANTRAG, BESCHLUSS:');
      expect(prompt.system).toContain('Gib ihren Inhalt nie als Position oder Beschluss');
    }
  });

  it('bleibt aus den Prompts für eigene Dokumente heraus', () => {
    for (const prompt of [buildDraftPromptGeneral(), buildConcisePromptGeneral()]) {
      expect(prompt.system).not.toContain('ÄNDERUNGSANTRAG');
    }
  });
});
