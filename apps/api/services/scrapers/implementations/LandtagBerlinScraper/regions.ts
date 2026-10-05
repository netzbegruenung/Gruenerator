/**
 * Die zwölf Berliner Bezirke für den Filter „Bezirk", jeweils mit ihren
 * Ortsteilen — eine Anfrage nennt meist „Moabit" oder „Rudow", nicht den Bezirk.
 *
 * „Mitte" nur mit Kontext: allein ist es zu oft „die Mitte der Gesellschaft".
 * „Buch" (Pankow) fehlt aus demselben Grund.
 */

import { type Gazetteer } from '../../parliament/regions.js';

export const BERLIN_BEZIRKE: Gazetteer = {
  Mitte: [
    'Bezirk(?:samt)? Mitte',
    'Berlin-Mitte',
    'in Mitte',
    'Moabit',
    'Wedding',
    'Gesundbrunnen',
    'Tiergarten',
    'Hansaviertel',
  ],
  'Friedrichshain-Kreuzberg': ['Friedrichshain-Kreuzberg', 'Friedrichshain', 'Kreuzberg'],
  Pankow: [
    'Pankow',
    'Prenzlauer Berg',
    'Weißensee',
    'Heinersdorf',
    'Niederschönhausen',
    'Karow',
    'Blankenburg',
    'Französisch Buchholz',
  ],
  'Charlottenburg-Wilmersdorf': [
    'Charlottenburg-Wilmersdorf',
    'Charlottenburg',
    'Wilmersdorf',
    'Westend',
    'Halensee',
    'Schmargendorf',
    'Grunewald',
  ],
  Spandau: ['Spandau', 'Staaken', 'Kladow', 'Gatow', 'Siemensstadt', 'Haselhorst', 'Hakenfelde'],
  'Steglitz-Zehlendorf': [
    'Steglitz-Zehlendorf',
    'Steglitz',
    'Zehlendorf',
    'Lichterfelde',
    'Lankwitz',
    'Dahlem',
    'Wannsee',
    'Nikolassee',
  ],
  'Tempelhof-Schöneberg': [
    'Tempelhof-Schöneberg',
    'Tempelhof',
    'Schöneberg',
    'Friedenau',
    'Mariendorf',
    'Marienfelde',
    'Lichtenrade',
  ],
  Neukölln: ['Neukölln', 'Britz', 'Buckow', 'Rudow', 'Gropiusstadt'],
  'Treptow-Köpenick': [
    'Treptow-Köpenick',
    'Treptow',
    'Köpenick',
    'Adlershof',
    'Johannisthal',
    'Schöneweide',
    'Friedrichshagen',
    'Müggelheim',
    'Rahnsdorf',
    'Altglienicke',
    'Baumschulenweg',
    'Plänterwald',
  ],
  'Marzahn-Hellersdorf': [
    'Marzahn-Hellersdorf',
    'Marzahn',
    'Hellersdorf',
    'Kaulsdorf',
    'Mahlsdorf',
    'Biesdorf',
  ],
  Lichtenberg: ['Lichtenberg', 'Hohenschönhausen', 'Friedrichsfelde', 'Karlshorst', 'Rummelsburg'],
  Reinickendorf: [
    'Reinickendorf',
    'Tegel',
    'Wittenau',
    'Frohnau',
    'Hermsdorf',
    'Heiligensee',
    'Lübars',
    'Waidmannslust',
    'Märkisches Viertel',
  ],
};
