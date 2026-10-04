import { describe, expect, it } from 'vitest';

import { parseDrucksache } from './drucksacheParser.js';

const filler = 'Dieser Satz ist nur da, damit der Abschnitt über die Mindestlänge kommt.';

describe('parseDrucksache', () => {
  it('zerlegt einen Gesetzentwurf in Vorblatt, Artikel und Begründung', () => {
    const text = [
      'Deutscher Bundestag Drucksache 21/4268',
      '21. Wahlperiode 24.02.2026',
      'Gesetzentwurf',
      'A. Problem und Ziel',
      `Mieten steigen schneller als Einkommen. ${filler}`,
      'B. Lösung',
      `Die Mietpreisbremse wird entfristet. ${filler}`,
      'Artikel 1',
      `Das Bürgerliche Gesetzbuch wird wie folgt geändert. ${filler}`,
      'Begründung',
      'A. Allgemeiner Teil',
      `Die Regelung schützt Mieterinnen und Mieter. ${filler}`,
      'Zu Artikel 1',
      `Die Änderung betrifft § 556d BGB. ${filler}`,
    ].join('\n');

    const sections = parseDrucksache(text, 'Gesetzentwurf');
    expect(sections.map((s) => [s.sectionType, s.title])).toEqual([
      ['problem', 'A. Problem'],
      ['loesung', 'B. Lösung'],
      ['artikel', 'Artikel 1'],
      ['begruendung_allgemein', 'Begründung – Allgemeiner Teil'],
      ['begruendung_artikel', 'Begründung zu Artikel 1'],
    ]);
    expect(sections[1].text).toContain('Mietpreisbremse wird entfristet');
  });

  it('macht Gliederungsüberschriften der Begründung zu #-Zeilen für den Chunker', () => {
    const text = [
      'Begründung',
      'A. Allgemeiner Teil',
      'I. Zielsetzung und Notwendigkeit',
      `Mieten steigen. ${filler}`,
      'II. Wesentlicher Inhalt',
      `Die Bremse wird entfristet. ${filler}`,
    ].join('\n');

    const [section] = parseDrucksache(text, 'Gesetzentwurf');
    expect(section.text.split('\n').filter((l) => l.startsWith('# '))).toEqual([
      '# I. Zielsetzung und Notwendigkeit',
      '# II. Wesentlicher Inhalt',
    ]);
  });

  it('macht aus einer Kleinen Anfrage Vorbemerkung und Einzelfragen', () => {
    const text = [
      'Kleine Anfrage',
      `Die Wasserstoffstrategie kommt nur langsam voran. ${filler}`,
      'Wir fragen die Bundesregierung:',
      '1. Wie viele Elektrolyseure sind in Betrieb?',
      '2. Welche Förderung ist bis 2030 geplant',
      'und wie wird sie finanziert?',
    ].join('\n');

    const sections = parseDrucksache(text, 'Kleine Anfrage');
    expect(sections.map((s) => s.sectionType)).toEqual(['vorbemerkung', 'question', 'question']);
    expect(sections[2]).toMatchObject({
      title: 'Frage 2',
      text: '2. Welche Förderung ist bis 2030 geplant\nund wie wird sie finanziert?',
    });
  });

  it('trennt beim Antrag Einleitung, Beschlusspunkte und Begründung', () => {
    const text = [
      'Antrag',
      `Bezahlbares Wohnen ist eine soziale Frage. ${filler}`,
      'Der Bundestag fordert die Bundesregierung auf,',
      '1. die Mietpreisbremse sofort zu verlängern;',
      '2. einen bundesweiten Mietendeckel einzuführen.',
      'Begründung',
      `Die Mieten in Ballungsräumen sind stark gestiegen. ${filler}`,
    ].join('\n');

    const sections = parseDrucksache(text, 'Antrag');
    expect(sections.map((s) => [s.sectionType, s.title])).toEqual([
      ['introduction', 'Einleitung'],
      ['resolution', 'Beschlussantrag'],
      ['resolution_point', 'Beschlusspunkt 1'],
      ['resolution_point', 'Beschlusspunkt 2'],
      ['begruendung', 'Begründung'],
    ]);
  });
});
