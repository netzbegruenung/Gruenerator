import { describe, expect, it } from 'vitest';

import { looksLikeDocsHelpQuestion } from './classifierParsing.js';

describe('looksLikeDocsHelpQuestion', () => {
  it('catches instructional questions about a Grünerator feature', () => {
    for (const text of [
      'Wie erstelle ich ein Sharepic?',
      'wie lege ich ein Notebook an',
      'Wie binde ich die Grüne Wolke ein?',
      'Wie richte ich einen MCP-Server ein?',
      'Wie funktioniert die Agentura?',
      'Wie nutze ich den Grünerator für Untertitel?',
    ]) {
      expect(looksLikeDocsHelpQuestion(text), text).toBe(true);
    }
  });

  it('catches explicit requests for documentation', () => {
    for (const text of [
      'Gibt es eine Anleitung für Sharepics?',
      'Wo finde ich das Handbuch zum Grünerator?',
      'Schritt für Schritt Anleitung Notebook',
    ]) {
      expect(looksLikeDocsHelpQuestion(text), text).toBe(true);
    }
  });

  it('does NOT hijack a generation command', () => {
    // The whole reason the gate requires "wie <verb> ich": these must keep
    // routing to their generation intents and actually build the artifact.
    for (const text of [
      'Erstelle ein Sharepic zum Klimaschutz',
      'Mach mir eine Präsentation über die Energiewende',
      'Schreib einen Instagram-Post zum Nahverkehr',
      'Erstelle ein Notebook für meine Anträge',
    ]) {
      expect(looksLikeDocsHelpQuestion(text), text).toBe(false);
    }
  });

  it('does NOT grab content questions that merely sound instructional', () => {
    for (const text of [
      'Wie kann ich die Energiewende erklären?',
      'Wie funktioniert der Emissionshandel?',
      'Wie erstelle ich einen guten Antrag für den Kreisverband?',
      'Was sagen die Grünen zum Kohleausstieg?',
    ]) {
      expect(looksLikeDocsHelpQuestion(text), text).toBe(false);
    }
  });

  it('handles empty input', () => {
    expect(looksLikeDocsHelpQuestion('')).toBe(false);
    expect(looksLikeDocsHelpQuestion('   ')).toBe(false);
  });
});
