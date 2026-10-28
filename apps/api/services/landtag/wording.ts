/**
 * Filter aus dem Wortlaut der Frage für die Landtage: Zeitraum, Fraktion und
 * Art kommen aus denselben Erkennern wie beim Bundestag (`planDetect.ts`) und
 * werden auf die normalisierten Landtags-Werte abgebildet. Was wörtlich in der
 * Frage steht, darf nicht vom Modell abhängen. Reine Funktionen, werfen nie.
 */
import { type LandtagFilter, type LandtagFraktion, type LandtagTyp } from '@gruenerator/contracts';

import { detectDrucksachetyp, detectUrheber, detectZeitraum } from '../bundestag/qa/planDetect.js';

const FRAKTION_VON_URHEBER: Record<string, LandtagFraktion> = {
  'Fraktion BÜNDNIS 90/DIE GRÜNEN': 'gruene',
  'Fraktion der CDU/CSU': 'cdu',
  'Fraktion der SPD': 'spd',
  'Fraktion der AfD': 'afd',
  'Fraktion DIE LINKE': 'linke',
  'Fraktion der FDP': 'fdp',
};

const TYP_VON_BUNDESTAG: Record<string, LandtagTyp> = {
  Antrag: 'Antrag',
  'Kleine Anfrage': 'Anfrage',
  'Große Anfrage': 'Anfrage',
  Gesetzentwurf: 'Gesetzentwurf',
  'Beschlussempfehlung und Bericht': 'Beschlussempfehlung',
  Antwort: 'Antwort',
  Änderungsantrag: 'Änderungsantrag',
};

/** „Schriftliche Anfrage" ist die Berliner Form der Kleinen Anfrage und steht so im Wortlaut. */
const SCHRIFTLICHE_ANFRAGE = /\bschriftliche[nrsm]?\s+anfrage[n]?\b/i;
/** Der Bundestag-Erkenner kennt BSW nicht (dort nicht vertreten); Berlin meldet es als „nicht vertreten“. */
const BSW = /\bBSW\b|\bBündnis\s+Sahra\s+Wagenknecht\b/;

export function detectLandtagFromWording(question: string): LandtagFilter {
  const found: LandtagFilter = {};
  const typ = new Set<LandtagTyp>();
  for (const t of detectDrucksachetyp(question)) {
    const mapped = TYP_VON_BUNDESTAG[t];
    if (mapped) typ.add(mapped);
  }
  if (SCHRIFTLICHE_ANFRAGE.test(question)) typ.add('Anfrage');
  if (typ.size > 0) found.typ = [...typ];

  const fraktion = new Set<LandtagFraktion>();
  for (const u of detectUrheber(question)) {
    const mapped = FRAKTION_VON_URHEBER[u];
    if (mapped) fraktion.add(mapped);
  }
  if (BSW.test(question)) fraktion.add('bsw');
  if (fraktion.size > 0) found.fraktion = [...fraktion];

  const zeitraum = detectZeitraum(question);
  // „in Berlin 2026": ein bloßes Jahr ohne „im/in/seit" meint das ganze Jahr.
  const jahr = /(?<![\d./-])(20[1-3]\d)(?![\d./-])/.exec(question)?.[1];
  if (!zeitraum.datumVon && !zeitraum.datumBis && jahr) {
    return { ...found, datumVon: `${jahr}-01-01`, datumBis: `${jahr}-12-31` };
  }
  return { ...found, ...zeitraum };
}
