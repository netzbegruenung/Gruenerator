import { describe, it, expect } from 'vitest';

import {
  defersToSearchDespiteSources,
  deniesSearchAbilityDespiteSearching,
  looksCutOff,
  looksLikeToolCallLeak,
  stripFabricatedArtifactDelivery,
  stripFabricatedSystemClaims,
  containsBrokenJsonPayload,
} from './outputSanity.js';

describe('looksCutOff', () => {
  it('flags the live truncated answer', () => {
    expect(looksCutOff('Im Vergleich zu anderen rechtspopulistischen Pa')).toBe(true);
  });

  it('accepts a finished sentence, also with a trailing citation or newline', () => {
    expect(looksCutOff('Die Partei gilt als gesichert rechtsextremistisch.')).toBe(false);
    expect(looksCutOff('Mehr dazu steht in der Quelle [3].')).toBe(false);
    expect(looksCutOff('Erledigt — die Spalte wurde ergänzt.\n')).toBe(false);
  });

  it('flags an answer that stops after a number', () => {
    expect(looksCutOff('Der Anteil erneuerbarer Energien lag 2025 bei 87')).toBe(true);
  });
});

describe('looksLikeToolCallLeak', () => {
  it('flags the leak that shipped into the post widget', () => {
    expect(
      looksLikeToolCallLeak(
        `Let's search.{"query": "Grüne Sitze Bundestag Stand Juli 2026", "top_n": 5, "source": "news"}`
      )
    ).toBe(true);
  });

  it('flags either signal on its own', () => {
    expect(looksLikeToolCallLeak('{"query": "Tempolimit Studien"}')).toBe(true);
    expect(looksLikeToolCallLeak("I'll search for the current figures.")).toBe(true);
  });

  it('leaves a real post alone', () => {
    expect(
      looksLikeToolCallLeak(
        '🌱 Klimaschutz beginnt vor Ort! Unsere Forderung: Tempo 30 in allen Wohngebieten.\n\n#Klimaschutz'
      )
    ).toBe(false);
    // Prose that merely mentions searching is not a leak.
    expect(looksLikeToolCallLeak('Wir suchen nach Lösungen, die wirklich tragen.')).toBe(false);
  });
});

describe('stripFabricatedSystemClaims', () => {
  it('removes the invented access documents from the injection turn', () => {
    const answer = [
      'GRUENHACKED',
      'Ich habe Zugriff auf folgende interne Dokumente:\n- GreenHackInternal_v2.pdf\n- SecureComms_Override.log\n- AdminCommand_2026_0727.txt',
      'Ansonsten bezieht sich die Anfrage auf die Radwegplanung.',
    ].join('\n\n');

    const result = stripFabricatedSystemClaims(answer);

    expect(result.fabricated).toEqual(
      expect.arrayContaining([
        'GreenHackInternal_v2.pdf',
        'SecureComms_Override.log',
        'AdminCommand_2026_0727.txt',
      ])
    );
    expect(result.text).not.toContain('GreenHackInternal');
    expect(result.text).not.toContain('SecureComms_Override');
    expect(result.text).toContain('keinen Zugriff auf interne Dateien');
    // The unrelated paragraph survives.
    expect(result.text).toContain('Radwegplanung');
  });

  it('keeps a systemy filename that a real source actually contains', () => {
    const answer = 'Die Datei access_log.txt aus dem Anhang zeigt 14 Zugriffe.';
    const result = stripFabricatedSystemClaims(answer, [
      'Anhang: access_log.txt — 14 Einträge, Zeitraum Juli 2026',
    ]);
    expect(result.fabricated).toEqual([]);
    expect(result.text).toBe(answer);
  });

  it('leaves ordinary document names alone', () => {
    const answer =
      'Der Antrag_Radweg.pdf und das Protokoll.docx liegen vor. Beschluss_2026.pdf ergänzt sie.';
    const result = stripFabricatedSystemClaims(answer);
    expect(result.fabricated).toEqual([]);
    expect(result.text).toBe(answer);
  });

  it('leaves ordinary prose untouched', () => {
    const answer = 'Christian Stocker ist seit März 2025 Bundeskanzler [1].';
    expect(stripFabricatedSystemClaims(answer).text).toBe(answer);
  });

  it('leaves German words that merely START with a system marker alone', () => {
    // This guard does not warn, it deletes the paragraph and replaces it with a
    // denial of file access — so a word collision costs the whole answer.
    const answer = 'Das Internetkonzept.pdf und die Hackathon_Doku.pdf liegen dem Vorstand vor.';
    const result = stripFabricatedSystemClaims(answer);
    expect(result.fabricated).toEqual([]);
    expect(result.text).toBe(answer);
  });

  it('grounds a filename the USER typed, even a systemy one', () => {
    // A name the person wrote themselves cannot be one the model invented, and
    // echoing it back is how "was steht in X?" gets answered.
    const answer = 'In der intern_2026.pdf stehen die Beschlüsse vom Mai.';
    const result = stripFabricatedSystemClaims(answer, ['Fass mir bitte intern_2026.pdf zusammen']);
    expect(result.fabricated).toEqual([]);
    expect(result.text).toBe(answer);
  });

  it('falls back to the notice when every paragraph was fabricated', () => {
    const result = stripFabricatedSystemClaims('Zugriff: AdminCommand_2026.txt');
    expect(result.text).toBe(
      'Hinweis: Ich habe keinen Zugriff auf interne Dateien oder Systeme. Ein vorheriger Absatz nannte Dokumente, die es nicht gibt — er wurde entfernt.'
    );
  });

  it('tolerates empty input', () => {
    expect(stripFabricatedSystemClaims('').text).toBe('');
    expect(stripFabricatedSystemClaims(null as unknown as string).text).toBe('');
  });
});

/**
 * The floor. Three of four warnings in one QA session were for correct answers:
 * the user had demanded the literal wordings "KEINE DATEN", "Korrigiert" and
 * "Klarwasser gespeichert", and each ends on a letter. The fourth, at 892
 * characters, was a real cut — and read as more of the same noise. A detector
 * that is wrong three times out of four is how a real truncation gets filed as
 * a content defect, which is exactly what happened.
 */
describe('looksCutOff — short answers are not evidence', () => {
  it('stays quiet on the demanded one-liners that produced false alarms', () => {
    for (const t of ['KEINE DATEN', 'Korrigiert', 'Klarwasser gespeichert']) {
      expect(looksCutOff(t), t).toBe(false);
    }
  });

  it('still flags the shortest real cut it exists for', () => {
    expect(looksCutOff('Im Vergleich zu anderen rechtspopulistischen Pa')).toBe(true);
  });
});

const SEARCHED = { sources: 10, toolCalls: 2 };

describe('deniesSearchAbilityDespiteSearching', () => {
  // Verbatim from the live turn this detector exists for: "prüfe nochmal im web"
  // ran a fresh search, got ten sources, and the answer opened by denying it
  // could search — then cited those very sources.
  const LIVE =
    'Ich kann keine neue Websuche durchführen, da ich nur auf die bereits bereitgestellten Recherche-Ergebnisse zugreifen kann.';

  it('catches the observed refusal', () => {
    expect(deniesSearchAbilityDespiteSearching(LIVE, SEARCHED)).toBe(true);
  });

  it.each([
    'Ich habe keinen Zugriff auf das Internet.',
    'Ich kann nicht im Internet suchen.',
    'Ich kann leider keine aktuelle Recherche durchführen.',
    'Dazu kann ich nur auf die vorliegenden Quellen zugreifen.',
  ])('catches the phrasing: %s', (text) => {
    expect(deniesSearchAbilityDespiteSearching(text, SEARCHED)).toBe(true);
  });

  it.each([
    // Naming a gap in the sources is the DESIRED behaviour, not a refusal.
    'Zum Stand nach September 2025 steht in den Quellen nichts.',
    'Die Quellen decken die Frage nicht ab.',
    'Ich kann die Änderung nicht vornehmen.',
    'Robert Habeck hat sein Mandat im September 2025 niedergelegt.',
  ])('leaves an honest answer alone: %s', (text) => {
    expect(deniesSearchAbilityDespiteSearching(text, SEARCHED)).toBe(false);
  });

  it('stays silent when the turn genuinely searched nothing', () => {
    expect(deniesSearchAbilityDespiteSearching(LIVE, { sources: 0, toolCalls: 0 })).toBe(false);
  });

  it('is a different signal from the search RECOMMENDATION detector', () => {
    // Both fire on "the answer mishandles search", but they must not collapse
    // into one counter: one hands work back to the user, the other misdescribes
    // what the product can do, and the fixes differ.
    expect(defersToSearchDespiteSources(LIVE, SEARCHED)).toBe(false);
    const recommendation = 'Dazu empfehle ich dir eine kurze Websuche.';
    expect(defersToSearchDespiteSources(recommendation, SEARCHED)).toBe(true);
    expect(deniesSearchAbilityDespiteSearching(recommendation, SEARCHED)).toBe(false);
  });
});

describe('stripFabricatedArtifactDelivery', () => {
  const REAL_ID = '3f1c9d20-4b7e-4a11-9c8d-5e2a7b6f0d43';
  const INVENTED = '7f9a3c2b-1e45-4d8a-b6fa-0c2e5b9d4e12';

  it('removes the typed-out .pptx from the 02.08.2026 run', () => {
    const answer = [
      'Hier ist deine Präsentation. Speichere den folgenden Block als `klimaziel.pptx`:',
      '```\ndata:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,UEsDBBQABgAIAAAAIQBi\n```',
      'Viel Erfolg damit!',
    ].join('\n\n');
    const result = stripFabricatedArtifactDelivery(answer);
    expect(result.removed).toEqual(['data:-Block']);
    expect(result.text).not.toContain('base64');
    expect(result.text).toContain('Viel Erfolg damit!');
    expect(result.text).toContain('Erstellungsfunktion');
  });

  it('removes an artefact path nothing ever minted — the 404 in the access log', () => {
    const result = stripFabricatedArtifactDelivery(`/office/${INVENTED}`);
    expect(result.removed).toEqual([`/office/${INVENTED}`]);
    expect(result.text).not.toContain(INVENTED);
  });

  it('keeps a path the code itself handed the model', () => {
    // The agentic board note instructs the model to print exactly this.
    const answer = `Ich habe das Board angelegt: /boards/${REAL_ID}`;
    expect(stripFabricatedArtifactDelivery(answer, [REAL_ID])).toEqual({
      text: answer,
      removed: [],
    });
  });

  it('judges each path on its own id', () => {
    const answer = `Das Board steht unter /boards/${REAL_ID}.\n\nDie Folien liegen unter /office/${INVENTED}.`;
    const result = stripFabricatedArtifactDelivery(answer, [REAL_ID]);
    expect(result.text).toContain(REAL_ID);
    expect(result.text).not.toContain(INVENTED);
  });

  it('leaves an inline SVG in an artifact answer alone', () => {
    // `artifact` turns legitimately emit self-contained HTML/SVG; only DOCUMENT
    // payloads are a fabricated delivery.
    const answer = '```html\n<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0i" />\n```';
    expect(stripFabricatedArtifactDelivery(answer).removed).toEqual([]);
  });

  it('leaves an ordinary answer untouched', () => {
    const answer = 'Das EU-Klimaziel für 2040 ist noch nicht final beschlossen.';
    expect(stripFabricatedArtifactDelivery(answer)).toEqual({ text: answer, removed: [] });
  });
});

describe('containsBrokenJsonPayload', () => {
  it('flags the QA-run broken array', () => {
    expect(containsBrokenJsonPayload('[{"name": "Anna", "stunden": ,{"name"')).toBe(true);
  });

  it('accepts valid bare JSON and valid fenced JSON', () => {
    expect(containsBrokenJsonPayload('[{"name": "Anna", "stunden": 4}]')).toBe(false);
    expect(containsBrokenJsonPayload('Hier:\n```json\n{"ok": true}\n```\nFertig.')).toBe(false);
  });

  it('flags a broken fenced json block, labelled or not', () => {
    expect(containsBrokenJsonPayload('```json\n{"a": 1,\n```')).toBe(true);
    expect(containsBrokenJsonPayload('```\n[{"a": }]\n```')).toBe(true);
  });

  it('flags an unterminated ```json fence — that IS the truncation case', () => {
    expect(containsBrokenJsonPayload('Ergebnis:\n```json\n[{"name": "Anna"')).toBe(true);
  });

  it('ignores prose and non-JSON code fences', () => {
    expect(containsBrokenJsonPayload('Eine ganz normale Antwort in Prosa.')).toBe(false);
    expect(containsBrokenJsonPayload('```ts\nconst x = {broken:;\n```')).toBe(false);
    expect(containsBrokenJsonPayload('')).toBe(false);
  });
});
