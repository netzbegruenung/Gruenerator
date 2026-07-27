import { describe, it, expect } from 'vitest';

import { stripFabricatedSystemClaims } from './outputSanity.js';

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
