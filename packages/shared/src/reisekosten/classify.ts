/**
 * Local beleg classification: reads the text the browser extracted from a PDF
 * and decides what the document is, without sending it anywhere. Only when this
 * is unsure does the text go to the server's LLM pass — so the heuristics aim
 * for precision, and say `sicher: false` rather than guess.
 */
import { type BelegKategorie } from '@gruenerator/contracts';

import { BELEG_KATEGORIEN } from './belegKategorien.js';

export interface LokaleKlassifikation {
  kategorie: BelegKategorie;
  betrag: number | null;
  datum: string | null;
  von: string | null;
  nach: string | null;
  businessPackage: boolean | null;
  /** False when the server should take a second look. */
  sicher: boolean;
}

/** First match wins, so the specific patterns stand before the broad ones. */
const KATEGORIE_REGELN: Array<[BelegKategorie, RegExp]> = [
  ['vorstandsbeschluss', /vorstandsbeschluss|beschluss des (?:landes|kreis|bundes)?vorstand/],
  [
    'routenplaner',
    /routenplaner|(?:kürzeste|schnellste) (?:route|strecke)|google maps|openstreetmap/,
  ],
  ['deutschlandticket', /deutschland-?ticket/],
  ['taxiquittung', /\btaxi|taxameter/],
  [
    'mietwagenrechnung',
    /\b(?:sixt|europcar|hertz|avis|share now|flinkster|cambio|stadtmobil)\b|carsharing|mietwagen/,
  ],
  [
    'hotelrechnung',
    /\b(?:hotel|pension|jugendherberge|airbnb|beherbergung|logis)\b|übernachtung(?:en)?\b.*\b(?:zimmer|nacht)/s,
  ],
  ['teilnahmebeitrag', /teilnahme(?:beitrag|gebühr)|tagungsbeitrag|anmeldegebühr/],
  ['parkbeleg', /park(?:haus|ticket|gebühr|schein|platz)|\bapcoa\b|contipark/],
];

const DB_MARKER = /deutsche bahn|db fernverkehr|db regio|db vertrieb|bahn\.de|\bice\b|\bic\b \d/;
const DB_RECHNUNG = /rechnungsnummer|rechnung nr|rechnungsdatum/;
const DB_TICKET = /online-?ticket|handy-?ticket|fahrkarte|auftragsnummer/;
const DB_PREISAUSKUNFT = /preisauskunft|verbindungsübersicht|ihre reiseverbindung/;
const OEPNV_MARKER =
  /\b(?:vrr|vrs|avv|mvv|bvg|hvv|rmv|vbb|kvb|rheinbahn|üstra|vgn|nahverkehr|einzelticket|tagesticket|4er-ticket)\b/;

const AMOUNT = String.raw`(\d{1,4}(?:\.\d{3})*,\d{2})`;
const LABELED_AMOUNT = new RegExp(
  String.raw`(?:gesamt(?:betrag|summe|preis)?|endbetrag|summe|zu zahlen|rechnungsbetrag|betrag|preis|total)[^\d\n]{0,25}` +
    AMOUNT +
    String.raw`\s*(?:€|eur)?`,
  'g'
);
const ANY_EURO = new RegExp(AMOUNT + String.raw`\s*(?:€|eur)`, 'g');

function parseEuro(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

/** The labeled total if there is one, else the largest euro amount on the page. */
function findBetrag(lower: string): number | null {
  const labeled = [...lower.matchAll(LABELED_AMOUNT)].map((m) => parseEuro(m[1] ?? ''));
  const pool =
    labeled.length > 0 ? labeled : [...lower.matchAll(ANY_EURO)].map((m) => parseEuro(m[1] ?? ''));
  const valid = pool.filter((n) => Number.isFinite(n) && n > 0);
  return valid.length > 0 ? Math.max(...valid) : null;
}

function findDatum(text: string): string | null {
  const de = /\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/.exec(text);
  if (de) {
    const [, d = '', m = '', y = ''] = de;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  return iso ? iso[0] : null;
}

function findStrecke(text: string): { von: string | null; nach: string | null } {
  const m = /\bvon\s+([^\n]{2,60}?)\s+nach\s+([^\n]{2,60}?)(?:\s{2,}|\n|,|$)/i.exec(text);
  return m ? { von: (m[1] ?? '').trim(), nach: (m[2] ?? '').trim() } : { von: null, nach: null };
}

function detectKategorie(lower: string): { kategorie: BelegKategorie; sicher: boolean } {
  for (const [kategorie, re] of KATEGORIE_REGELN) {
    if (re.test(lower)) return { kategorie, sicher: true };
  }
  if (DB_MARKER.test(lower)) {
    if (DB_PREISAUSKUNFT.test(lower) && !DB_TICKET.test(lower)) {
      return { kategorie: 'flexpreis_vergleich', sicher: false };
    }
    if (DB_RECHNUNG.test(lower) && !/online-?ticket|handy-?ticket/.test(lower)) {
      return { kategorie: 'db_rechnung', sicher: true };
    }
    if (DB_TICKET.test(lower)) return { kategorie: 'db_ticket', sicher: true };
    return { kategorie: 'db_ticket', sicher: false };
  }
  if (OEPNV_MARKER.test(lower)) return { kategorie: 'oepnv_ticket', sicher: true };
  return { kategorie: 'sonstiges', sicher: false };
}

export function classifyBelegText(text: string): LokaleKlassifikation {
  const lower = text.toLowerCase();
  const { kategorie, sicher } = detectKategorie(lower);
  const betrag = findBetrag(lower);
  const { von, nach } = findStrecke(text);

  let businessPackage: boolean | null = null;
  if (kategorie === 'hotelrechnung') {
    if (/business[- ]?package|servicepauschale/.test(lower)) businessPackage = true;
    else if (/frühstück/.test(lower)) businessPackage = false;
  }

  // An invoice without a readable amount is half a result — let the server try.
  const betragFehlt = BELEG_KATEGORIEN[kategorie].traegtBetrag && betrag === null;
  return {
    kategorie,
    betrag,
    datum: findDatum(text),
    von,
    nach,
    businessPackage,
    sicher: sicher && !betragFehlt,
  };
}
