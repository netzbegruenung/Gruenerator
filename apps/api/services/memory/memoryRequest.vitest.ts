/**
 * The table IS the specification of `looksLikeMemoryRequest`: every row is a
 * message shape that must (or must not) reach the `memory` tool. Borderline
 * cases are documented here, not in the regex.
 */
import { describe, expect, it } from 'vitest';

import { looksLikeMemoryRequest } from './memoryRequest.js';

describe('looksLikeMemoryRequest', () => {
  const requests: Array<[string, string]> = [
    ['merk dir', 'Merk dir, dass ich für den Kreisverband Köln schreibe.'],
    ['merke dir', 'Merke dir bitte: ich bin Fraktionsvorsitzende in Bonn.'],
    ['merk es dir', 'Ich heiße Alex, merk es dir.'],
    ['dir merken', 'Kannst du dir merken, dass ich Sie-Form bevorzuge?'],
    ['notier dir', 'Notier dir: keine Ausrufezeichen.'],
    ['speicher dir', 'Speicher dir, dass wir am Donnerstag Fraktionssitzung haben.'],
    ['denk daran', 'Denk daran, dass ich aus Österreich schreibe.'],
    ['vergiss', 'Vergiss die Regel mit den Gendersternchen.'],
    ["vergiss nicht (= don't forget)", 'Vergiss nicht, dass ich immer Du-Form will.'],
    ['erinner dich', 'Erinnere dich daran, dass ich für Instagram schreibe.'],
    ['ab jetzt immer', 'Nein, ab jetzt immer kürzer.'],
    ['ab sofort nur', 'Ab sofort nur noch mit Quellen antworten.'],
    ['in zukunft immer', 'In Zukunft immer ohne Gendersternchen.'],
    ['generell nie', 'Generell nie mehr als drei Absätze.'],
    ['grundsätzlich bitte', 'Grundsätzlich bitte in der Sie-Form.'],
    ['künftig keine', 'Künftig keine Emojis mehr.'],
    ['umlaut boundary', 'Zukünftig immer mit Betreffzeile.'],
  ];
  it.each(requests)('recognises a memory request: %s', (_label, text) => {
    expect(looksLikeMemoryRequest(text)).toBe(true);
  });

  const notRequests: Array<[string, string]> = [
    // A correction of THIS text is not a rule (decision 2026-09-01).
    ['bare correction', 'Nein, kürzer.'],
    ['bare correction with alternative', 'Nein, ich will das lieber als Liste.'],
    // Political prose that happens to carry the same words.
    ['in Zukunft as topic', 'Wie sieht Mobilität in Zukunft aus?'],
    ['generell as adverb', 'Wie steht die Partei generell zur Atomkraft?'],
    ['immer without the marker', 'Warum wird die Miete immer teurer?'],
    // Product question about memory — reading needs no tool.
    ['product question', 'Merkst du dir eigentlich, was ich schreibe?'],
    ['read request', 'Was weißt du über mich?'],
    ['unrelated verb', 'Erinnerungen an den Wahlkampf 2021 bitte zusammenfassen.'],
    ['empty', ''],
  ];
  it.each(notRequests)('leaves alone: %s', (_label, text) => {
    expect(looksLikeMemoryRequest(text)).toBe(false);
  });
});
