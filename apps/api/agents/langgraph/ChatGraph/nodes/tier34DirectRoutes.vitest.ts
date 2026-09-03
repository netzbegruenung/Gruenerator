/**
 * Die beiden Direktrouten aus Tier 3.4 — und was sie NICHT beanspruchen dürfen.
 *
 * Beide sind Präzisionsmuster, keine Gitter, und der Unterschied hat hier
 * Zähne. Der Dauerauftrag geht seit 09/2026 als `agentic` mit Pin auf das
 * Werkzeug `recurring_tasks` in die Schleife, und das Anlegen ist dort eine
 * Karte — ein Fehlalarm schreibt also nicht mehr in die Datenbank, aber er
 * zwingt den ersten Werkzeugaufruf auf `recurring_tasks` (`pinnedFirstTool`)
 * und lässt die eigentliche Frage einen Umweg nehmen. `chat_history` läuft
 * mit `excludeThreadId: currentThread`, ein Fehlalarm beantwortet die Nachricht
 * also aus FREMDEN Gesprächen.
 *
 * Jeder Fall unten stammt aus einem Review-Befund an der ersten Fassung, in der
 * das Rekurrenz-Gate nur „Takt UND Zustellwort" prüfte — ohne Frage-, ohne
 * Absage-Guard — und `CHAT_HISTORY_DIRECT` das mehrdeutige `da weiter` vom
 * Recall-Gitter geerbt hatte.
 */
import { describe, expect, it } from 'vitest';

import { CHAT_HISTORY_DIRECT, looksLikeRecurringOrder } from './classifierSignals.js';

describe('looksLikeRecurringOrder — beansprucht', () => {
  it.each([
    'Erinnere mich jeden Montag an die Fraktionssitzung',
    'Schick mir täglich eine Übersicht der Termine',
    'Sende mir wöchentlich einen Bericht zur Pressemappe',
    'Leg eine wöchentliche Aufgabe für den Newsletter an',
    'Erstell mir montags eine Erinnerung',
    'Benachrichtige mich alle 2 Wochen über neue Anträge',
  ])('%s', (text) => {
    expect(looksLikeRecurringOrder(text)).toBe(true);
  });
});

describe('looksLikeRecurringOrder — beansprucht NICHT', () => {
  it.each([
    // Fragen ÜBER etwas Wiederkehrendes bestellen nichts. Alle drei legten in
    // der ersten Fassung eine tägliche Aufgabe an, statt zu antworten.
    'Was steht täglich im Newsletter-Update?',
    'Der Bericht erscheint monatlich, worum geht es darin?',
    'Ich lese jeden Tag den Bericht der Tagesschau, was ist da drin?',
    'Wie oft erscheint der wöchentliche Bericht?',
  ])('Frage: %s', (text) => {
    expect(looksLikeRecurringOrder(text)).toBe(false);
  });

  it.each([
    // Eine Absage ist keine Bestellung — und die schlimmste Fehlform, weil sie
    // genau das anlegt, was abbestellt werden sollte.
    'Schick mir bitte nicht mehr täglich eine Übersicht',
    'Stopp, keine Erinnerung mehr montags',
    'Beende die tägliche Erinnerung, schick mir das nicht mehr',
    'Lösch die wöchentliche Aufgabe, benachrichtige mich nicht mehr',
  ])('Absage: %s', (text) => {
    expect(looksLikeRecurringOrder(text)).toBe(false);
  });

  it.each([
    // Takt ohne an-mich-gerichteten Auftrag. Ein blosses Zustell-Substantiv
    // („Update", „Bericht") reichte vorher und war der Grund für die Fragen oben.
    'Der Newsletter erscheint jeden Freitag',
    'Wir treffen uns wöchentlich zur Abstimmung',
    'Erinnere mich an die Sitzung', // Auftrag ohne Takt
    '',
  ])('kein Auftrag: %s', (text) => {
    expect(looksLikeRecurringOrder(text)).toBe(false);
  });
});

describe('looksLikeRecurringOrder — satzweise, nicht absatzweise', () => {
  it('findet den Auftrag hinter einer Frage', () => {
    // Live gemessen: das Fragezeichen im ERSTEN Satz löschte den echten
    // Dauerauftrag im ZWEITEN. Der Turn fiel in den Loop, der Planer machte null
    // Schritte, und die Antwort erklärte dem Nutzer, das Produkt könne keine
    // Erinnerungen setzen — eine Funktion, die es hat.
    expect(
      looksLikeRecurringOrder(
        'Wie funktioniert die Erinnerungsfunktion hier eigentlich? Und richte mir bitte gleich jeden Montag um 9 Uhr eine Erinnerung ein.'
      )
    ).toBe(true);
  });

  it('lässt eine reine Frage weiterhin in Ruhe', () => {
    expect(
      looksLikeRecurringOrder('Wie funktioniert die Erinnerungsfunktion hier eigentlich?')
    ).toBe(false);
  });

  it('eine Absage gilt für den ganzen Turn', () => {
    // Grenzfall mit Absicht konservativ: „Beende das, schick mir stattdessen
    // jeden Montag …" soll ein Modell entscheiden, kein Regex — und die sichere
    // Richtung ist, nichts anzulegen.
    expect(
      looksLikeRecurringOrder(
        'Beende die tägliche Erinnerung. Schick mir stattdessen jeden Montag eine Übersicht.'
      )
    ).toBe(false);
  });
});

describe('CHAT_HISTORY_DIRECT — die Präzisionshälfte', () => {
  it.each([
    'Was haben wir letztes Mal zur Kampagnenplanung besprochen?',
    'Finde mein Dokument über Windkraft',
    'Zeig mir meine Präsentationen',
    'Erinnerst du dich an unseren Chat über den Newsletter?',
    'In welchem Reel habe ich über Verkehr geredet?',
  ])('beansprucht: %s', (text) => {
    expect(CHAT_HISTORY_DIRECT.test(text)).toBe(true);
  });

  it.each([
    // Die vier Formulierungen, die das Recall-Gitter kennt und diese Route
    // bewusst NICHT — jede kann etwas anderes heissen, und der Recall schliesst
    // den aktuellen Thread aus, beantwortet sie also aus fremden Gesprächen.
    'Was war letzte Woche in der Ukraine los?',
    'Was haben wir für Optionen?',
    'Wir hatten drei Vorschläge im Raum',
    'Mach da weiter',
  ])('beansprucht NICHT: %s', (text) => {
    expect(CHAT_HISTORY_DIRECT.test(text)).toBe(false);
  });
});
