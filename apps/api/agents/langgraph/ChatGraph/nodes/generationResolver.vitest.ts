/**
 * Zwei getrennte Prüfgegenstände, und die Trennung ist der Punkt:
 *
 *  - `GENERATION_SIGNAL` ist das GITTER. Es entscheidet nichts, es entscheidet
 *    nur, ob gefragt wird. Ein Fehlalarm kostet einen ~900-Zeichen-Aufruf, ein
 *    Fehlschluss kostet den 27k-Prompt — also wird hier auf Recall geprüft, und
 *    zusätzlich auf die eine Klasse, die NICHT durchkommen darf: Bearbeitungen,
 *    für die es im Antwortraum gar keine Antwort gibt.
 *  - Der Parser ist die PRÄZISION. Modelle begründen sich, und eine
 *    Teilstring-Suche läse die Begründung als Antwort.
 */
import { describe, expect, it, vi } from 'vitest';

import { GENERATION_SIGNAL, resolveGenerationScope } from './generationResolver.js';

import type { AIWorkerPool } from '../../../../workers/types.js';

function poolAnswering(content: string, delayMs = 0): AIWorkerPool {
  return {
    processRequest: vi.fn(
      async () => new Promise((resolve) => setTimeout(() => resolve({ content }), delayMs))
    ),
  } as unknown as AIWorkerPool;
}

const resolve = (content: string): Promise<unknown> =>
  resolveGenerationScope({
    userContent: 'Mach daraus ein Sharepic',
    conversationContext: null,
    aiWorkerPool: poolAnswering(content),
  });

describe('GENERATION_SIGNAL — das Gitter', () => {
  it.each([
    'Mach daraus ein Sharepic',
    'Leg das als neues Dokument an',
    'Speicher das bitte als Dokument.',
    'Erstell mir ein Dokument mit einem kurzen Antrag',
    'Bau mir eine Präsentation zur Wärmeplanung',
    'Ich hätte gern ein PDF davon',
    'Fass die letzten Antworten kurz zusammen',
    'Kürze die Begründung auf die Hälfte',
    'Prüf diesen Antragsentwurf auf Schwächen',
  ])('lässt "%s" zum Auflöser durch', (text) => {
    expect(GENERATION_SIGNAL.test(text)).toBe(true);
  });

  it.each([
    // Bearbeitungen: der Antwortraum kennt KEINEN Anker-Intent, ein Durchlass
    // hier hiesse, die Bearbeitung auf „kein Artefakt" abzubiegen.
    'Mach das Foto heller',
    'Mach den Text größer',
    'Und jetzt noch die Uhrzeit 15 Uhr ergänzen',
    'Mach es blauer',
    // Reine Sachfragen haben mit Erzeugung nichts zu tun.
    'Was ist die Position der Grünen zur Windkraft?',
    'Mehr dazu bitte',
  ])('hält "%s" zurück', (text) => {
    expect(GENERATION_SIGNAL.test(text)).toBe(false);
  });

  it('matcht Umlaute überhaupt', () => {
    // Ohne u-Flag ist „ä" kein \\w, ein \\b davor wäre nie eine Wortgrenze und
    // die halbe Liste stumm — der Fehler, den dieses Repo schon einmal bezahlt
    // hat (siehe SYSTEM_MCP_PHRASING).
    expect(GENERATION_SIGNAL.test('Bau mir eine Präsentation')).toBe(true);
    expect(GENERATION_SIGNAL.test('Kürze das bitte')).toBe(true);
    expect(GENERATION_SIGNAL.test('Prüfe das bitte')).toBe(true);
  });
});

describe('resolveGenerationScope — der Parser', () => {
  it.each([
    ['dokument', 'save_as_doc'],
    ['sharepic', 'sharepic'],
    ['bild', 'image'],
    ['tabelle', 'create_sheet'],
    ['praesentation', 'create_presentation'],
    ['pdf', 'create_pdf'],
    ['diagramm', 'chart'],
    ['social', 'social_post'],
  ])('übersetzt "%s" nach %s', async (answer, intent) => {
    await expect(resolve(answer)).resolves.toEqual({ intent });
  });

  it('nimmt die Antwort auch mit Anführungszeichen und Punkt', async () => {
    await expect(resolve('"sharepic".')).resolves.toEqual({ intent: 'sharepic' });
  });

  it('liest eine ABLEHNUNG nicht als Bestellung', async () => {
    // „kein Dokument" sind zwei Token und liegen bequem in `max_tokens: 8`, also
    // die naheliegendste Antwortform überhaupt. Ohne die unflektierte Form matcht
    // nur `dokument` — und der Auflöser erzeugte genau das Artefakt, das er
    // gerade abgelehnt hatte.
    await expect(resolve('kein Dokument')).resolves.toBe('keine');
    await expect(resolve('Es soll kein Dokument entstehen, also keine')).resolves.toBe('keine');
    await expect(resolve('kein Sharepic')).resolves.toBe('keine');
  });

  it('nimmt die Umlaut-Schreibweise der Präsentation', async () => {
    // Der Prompt gibt „praesentation" vor, das Modell antwortet natürlich mit
    // Umlaut. Nur die Vorgabe zu kennen hiess, dieses Verdikt immer zu verwerfen
    // und den 27k-Prompt trotzdem zu zahlen.
    await expect(resolve('präsentation')).resolves.toEqual({ intent: 'create_presentation' });
  });

  it('liest keine Art aus einer Begründung heraus', async () => {
    // Das Modell rechtfertigt sich gern. Eine Teilstring-Suche läse hier
    // „dokument" und erzeugte eine Datei, die gerade abgelehnt wurde.
    await expect(resolve('keine — das wäre kein eigenes Dokument')).resolves.toBe('keine');
  });

  it('unterscheidet "keine" von "nichts entschieden"', async () => {
    // Der Aufrufer verlässt sich darauf: `keine` beendet den Turn als
    // produktion, `null` reicht ihn an die grosse Stufe weiter. Beides zu
    // verschmelzen machte aus jedem Provider-Schluckauf eine Routing-Änderung.
    await expect(resolve('keine')).resolves.toBe('keine');
    await expect(resolve('vielleicht so etwas ähnliches')).resolves.toBeNull();
    await expect(resolve('')).resolves.toBeNull();
  });

  it('fällt bei Zeitüberschreitung auf null', async () => {
    await expect(
      resolveGenerationScope({
        userContent: 'Mach daraus ein Sharepic',
        conversationContext: null,
        aiWorkerPool: poolAnswering('sharepic', 2500),
      })
    ).resolves.toBeNull();
  });

  it('fällt bei einem Provider-Fehler auf null', async () => {
    const pool = {
      processRequest: vi.fn(async () => {
        throw new Error('provider down');
      }),
    } as unknown as AIWorkerPool;
    await expect(
      resolveGenerationScope({
        userContent: 'Mach daraus ein Sharepic',
        conversationContext: null,
        aiWorkerPool: pool,
      })
    ).resolves.toBeNull();
  });
});
