/**
 * Die 31 Kreise und 22 kreisfreien Städte Nordrhein-Westfalens für den Filter
 * „Kreis / Stadt". Kreise hören auch auf ihre Kreisstadt, wo die anders heißt
 * (Detmold → Kreis Lippe). Weitere kreisangehörige Städte kennt die Liste nicht.
 *
 * Mit Kontext statt allein: „Essen" (das Essen), „Lippe" (der Fluss, der
 * Landschaftsverband Westfalen-Lippe), „Siegen" (das Verb steht klein, das
 * Nomen „Siegen" kaum je) bleibt ohne Kontext.
 */

import { type Gazetteer } from '../../parliament/regions.js';

export const NRW_REGIONS: Gazetteer = {
  'Städteregion Aachen': ['Aachen'],
  Bielefeld: ['Bielefeld'],
  Bochum: ['Bochum'],
  Bonn: ['Bonn'],
  Bottrop: ['Bottrop'],
  Dortmund: ['Dortmund'],
  Duisburg: ['Duisburg'],
  Düsseldorf: ['Düsseldorf'],
  Essen: ['Stadt Essen', 'in Essen', 'Essen-[A-ZÄÖÜ]\\p{L}+', 'Essener'],
  Gelsenkirchen: ['Gelsenkirchen'],
  Hagen: ['Stadt Hagen', 'in Hagen', 'Hagener', 'Fernuniversität Hagen'],
  // Ohne „-er“: „Hammer“ ist meist das Werkzeug, nicht die Einwohnerschaft.
  Hamm: ['Hamm(?!er)'],
  Herne: ['Herne'],
  Köln: ['Köln', 'Kölner'],
  Krefeld: ['Krefeld'],
  Leverkusen: ['Leverkusen'],
  Mönchengladbach: ['Mönchengladbach'],
  'Mülheim an der Ruhr': ['Mülheim an der Ruhr', 'Mülheim'],
  Münster: ['Münster'],
  Oberhausen: ['Oberhausen'],
  Remscheid: ['Remscheid'],
  Solingen: ['Solingen'],
  Wuppertal: ['Wuppertal'],
  'Kreis Borken': ['Borken'],
  'Kreis Coesfeld': ['Coesfeld'],
  'Kreis Düren': ['Düren'],
  'Ennepe-Ruhr-Kreis': ['Ennepe-Ruhr(?:-Kreis)?', 'Schwelm'],
  'Kreis Euskirchen': ['Euskirchen'],
  'Kreis Gütersloh': ['Gütersloh'],
  'Kreis Heinsberg': ['Heinsberg'],
  'Kreis Herford': ['Herford'],
  Hochsauerlandkreis: ['Hochsauerlandkreis', 'Meschede'],
  'Kreis Höxter': ['Höxter'],
  'Kreis Kleve': ['Kleve'],
  'Kreis Lippe': ['Kreis Lippe', 'Detmold'],
  'Märkischer Kreis': ['Märkische[nr]? Kreis', 'Lüdenscheid'],
  'Kreis Mettmann': ['Mettmann'],
  'Kreis Minden-Lübbecke': ['Minden-Lübbecke', 'Minden'],
  'Oberbergischer Kreis': ['Oberbergische[nr]? Kreis', 'Gummersbach'],
  'Kreis Olpe': ['Olpe'],
  'Kreis Paderborn': ['Paderborn'],
  'Kreis Recklinghausen': ['Recklinghausen'],
  'Rhein-Erft-Kreis': ['Rhein-Erft-Kreis', 'Bergheim'],
  'Rhein-Kreis Neuss': ['Rhein-Kreis Neuss', 'Neuss'],
  'Rhein-Sieg-Kreis': ['Rhein-Sieg-Kreis', 'Siegburg'],
  'Rheinisch-Bergischer Kreis': ['Rheinisch-Bergische[nr]? Kreis', 'Bergisch Gladbach'],
  'Kreis Siegen-Wittgenstein': ['Siegen-Wittgenstein', 'Siegen'],
  'Kreis Soest': ['Soest'],
  'Kreis Steinfurt': ['Steinfurt'],
  'Kreis Unna': ['Unna'],
  'Kreis Viersen': ['Viersen'],
  'Kreis Warendorf': ['Warendorf'],
  'Kreis Wesel': ['Wesel'],
};
