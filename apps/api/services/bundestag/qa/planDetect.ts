/**
 * Deterministische Filter aus dem Wortlaut der Frage: Drucksachetyp, Urheber,
 * Zeitraum. Was wörtlich in der Frage steht, darf nicht vom Modell abhängen.
 * Reine Funktionen, werfen nie.
 */
import { type BundestagFilter } from '@gruenerator/contracts';

type Typ = NonNullable<BundestagFilter['drucksachetyp']>[number];
type Urheber = NonNullable<BundestagFilter['urheber']>[number];

// Zusammensetzungen: „Entschließungsantrag" darf nicht zusätzlich als „Antrag" zählen,
// das erledigt die Wortgrenze vor „antrag" im letzten Eintrag.
const TYP_RULES: [RegExp, Typ][] = [
  [/\bentschlie(?:ß|ss)ungsantr(?:ag|äge|ägen|ages)\b/i, 'Entschließungsantrag'],
  // `\b` kennt kein „Ä" ohne u-Flag, daher die Unicode-Grenze.
  [/(?<!\p{L})änderungsantr(?:ag|äge|ägen|ages)(?!\p{L})/iu, 'Änderungsantrag'],
  [/\bkleine[nrsm]?\s+anfrage[n]?\b/i, 'Kleine Anfrage'],
  [/\bgro(?:ß|ss)e[nrsm]?\s+anfrage[n]?\b/i, 'Große Anfrage'],
  [/\bgesetzes?entw(?:urf|ürfe|ürfen|urfs)\b/i, 'Gesetzentwurf'],
  [/\bbeschlussempfehlung(?:en)?\b/i, 'Beschlussempfehlung und Bericht'],
  [/\bunterrichtung(?:en)?\b/i, 'Unterrichtung'],
  [/\b(?:antwort(?:en)?|geantwortet|antwortet)\b/i, 'Antwort'],
  [/\bantr(?:ag|äge|ägen|ages)\b/i, 'Antrag'],
];

export function detectDrucksachetyp(question: string): Typ[] {
  const out: Typ[] = [];
  for (const [re, typ] of TYP_RULES) if (re.test(question) && !out.includes(typ)) out.push(typ);
  return out;
}

// Groß-/Kleinschreibung zählt bei Grüne/Linke: „grünen Wasserstoff" und „linke Politik" sind keine Fraktionen.
const URHEBER_RULES: [RegExp, Urheber][] = [
  [
    /\bGrüne[n]?\b|\b[Gg]rüne[nrs]?\s+[Ff]raktion\b|\b[Bb]ündnis\s*90\b/,
    'Fraktion BÜNDNIS 90/DIE GRÜNEN',
  ],
  [/(?<![Ee]uropäische[nrm]?\s)\b(?:Union|CDU|CSU)\b/, 'Fraktion der CDU/CSU'],
  [/\bSPD\b/, 'Fraktion der SPD'],
  [/\bAfD\b/, 'Fraktion der AfD'],
  [/\bLinke[nr]?\b/, 'Fraktion DIE LINKE'],
  [/\bFDP\b/, 'Fraktion der FDP'],
  [/\b(?:Bundesregierung|Regierung)\b/, 'Bundesregierung'],
];

export function detectUrheber(question: string): Urheber[] {
  const out: Urheber[] = [];
  for (const [re, u] of URHEBER_RULES) {
    if (re.test(question) && !out.includes(u)) out.push(u);
  }
  return out;
}

const MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  märz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};
const MONTH_RE =
  '(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)';
const YEAR_OK = (y: number) => y >= 1949 && y <= 2100;

const p2 = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function detectZeitraum(question: string): { datumVon?: string; datumBis?: string } {
  const out: { datumVon?: string; datumBis?: string } = {};
  const seit = question.match(new RegExp(`\\bseit\\s+(?:${MONTH_RE}\\s+)?(\\d{4})\\b`, 'i'));
  if (seit && YEAR_OK(Number(seit[2]))) {
    const m = seit[1] ? MONTHS[seit[1].toLowerCase()] : 1;
    out.datumVon = `${seit[2]}-${p2(m)}-01`;
  }
  const im = question.match(/\b(?:im\s+jahr|im|in)\s+(\d{4})\b/i);
  if (im && !seit && YEAR_OK(Number(im[1]))) {
    out.datumVon = `${im[1]}-01-01`;
    out.datumBis = `${im[1]}-12-31`;
  }
  const bis = question.match(new RegExp(`\\b(vor|bis)\\s+(?:${MONTH_RE}\\s+)?(\\d{4})\\b`, 'i'));
  if (bis && YEAR_OK(Number(bis[3]))) {
    const y = Number(bis[3]);
    if (bis[2]) {
      const m = MONTHS[bis[2].toLowerCase()];
      out.datumBis = `${y}-${p2(m)}-${p2(lastDay(y, m))}`;
    } else if (bis[1].toLowerCase() === 'bis') {
      out.datumBis = `${y}-12-31`;
    } else {
      out.datumBis = `${y - 1}-12-31`;
    }
  }
  return out;
}

/** Alles zusammen; nur gesetzte Schlüssel. */
export function detectFromWording(question: string): BundestagFilter {
  const found: BundestagFilter = {};
  const typ = detectDrucksachetyp(question);
  if (typ.length) found.drucksachetyp = typ;
  const urheber = detectUrheber(question);
  if (urheber.length) found.urheber = urheber;
  return { ...found, ...detectZeitraum(question) };
}
