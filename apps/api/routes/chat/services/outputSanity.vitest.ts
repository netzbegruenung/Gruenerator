import { describe, it, expect } from 'vitest';

import { looksCutOff, looksLikeToolCallLeak, stripFabricatedSystemClaims } from './outputSanity.js';

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
