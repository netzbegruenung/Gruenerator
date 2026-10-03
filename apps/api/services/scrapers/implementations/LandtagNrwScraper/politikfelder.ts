/**
 * Die Landtagsdokumentation verschlagwortet jedes Dokument mit einem oder
 * mehreren Einträgen ihrer „Systematik" — 159 Sachgebiete, zu fein für einen
 * Filter im Notebook. Diese Tabelle fasst sie zu Politikfeldern zusammen; die
 * Original-Systematik bleibt als Feinfilter (`subcategories`) erhalten.
 *
 * Schlüssel sind die Sachgebiete aus dem Suchformular der Parlamentsdatenbank,
 * kleingeschrieben: die Trefferliste schreibt sie gemischt („Straßenverkehr"),
 * das Formular in Versalien („STRAßENVERKEHR"), und `toUpperCase` machte aus dem
 * ß ein SS. `politikfelder.vitest.ts` hält fest, dass jedes Sachgebiet des
 * Formulars hier ein Feld hat.
 */

const POLITIKFELDER: Record<string, readonly string[]> = {
  'Klima, Energie & Umwelt': [
    'abfall',
    'abwasser',
    'bergbau, bodenschätze',
    'boden',
    'energie',
    'erneuerbare energien',
    'fossile energien',
    'kernenergie',
    'klima',
    'natur',
    'schadstoffe, immissionen, emissionen',
    'umwelt',
    'wald, forsten',
    'wasser',
    'wasserbau',
  ],
  'Landwirtschaft, Ernährung & Verbraucherschutz': [
    'agrarmarkt',
    'ernährung',
    'jagd, fischerei',
    'landwirtschaft',
    'landwirtschaftliche berufe',
    'landwirtschaftliche betriebe',
    'ländlicher raum',
    'tier, tierschutz, tierhaltung',
    'tierkrankheiten',
    'verbraucher',
  ],
  'Verkehr & Mobilität': [
    'güterverkehr',
    'luftverkehr',
    'öffentlicher personenverkehr',
    'schienenverkehr',
    'schifffahrt',
    'straßenverkehr',
    'verkehr',
    'verkehrswegebau',
  ],
  'Bauen, Wohnen & Stadtentwicklung': [
    'bauwesen',
    'denkmalschutz, denkmalpflege',
    'raumordnung',
    'städtebau',
    'vermessungs- und katasterwesen',
    'wohnungswesen',
  ],
  'Wirtschaft & Arbeit': [
    'arbeit und beschäftigung',
    'arbeitsbedingungen',
    'arbeitsentgelt',
    'arbeitsmarkt',
    'außenwirtschaft',
    'dienstleistungen',
    'eich- und messwesen',
    'gewerbeaufsicht',
    'gewerbliche wirtschaft, industrie',
    'handel',
    'messen, ausstellungen',
    'mitbestimmung',
    'mittelständische wirtschaft',
    'normung',
    'preis- und kartellrecht',
    'versicherungen',
    'versorgung',
    'wirtschaft',
  ],
  'Bildung & Schule': [
    'allgemeinbildende schulen',
    'berufsausbildung',
    'berufsbildende schulen',
    'bildung',
    'erwachsenenbildung',
    'frühkindliche bildung',
    'lehrer',
    'privatschulen',
    'schulen',
    'sonderpädagogik',
  ],
  'Wissenschaft & Forschung': [
    'hochschulen für angewandte wissenschaften',
    'hochschulwesen',
    'kunst- und musikhochschulen',
    'raumfahrt',
    'technologie',
    'universitäten',
    'wissenschaft, forschung',
  ],
  'Gesundheit & Pflege': [
    'arzneimittel',
    'gesundheit',
    'gesundheitseinrichtungen',
    'gesundheitsschutz',
    'medizinische berufe',
    'pflege',
    'psychiatrie',
    'rauschmittel',
    'rettungswesen',
    'tod',
  ],
  'Soziales, Familie & Gleichstellung': [
    'alte menschen',
    'frauen, männer',
    'gesellschaft, bevölkerung',
    'kinder, jugendliche',
    'lebensgemeinschaften',
    'menschen mit behinderungen',
    'sexuelle identität',
    'sonstige gesellschaftliche gruppen',
    'soziale einrichtungen',
    'soziales',
    'sozialleistungen',
    'sozialversicherung',
    'stiftung',
  ],
  'Migration, Integration & Religion': ['ausländer, migranten', 'religionsgemeinschaften'],
  'Innere Sicherheit & Justiz': [
    'gerichte und staatsanwaltschaften',
    'innere sicherheit',
    'juristische berufe',
    'justiz',
    'justizverwaltung',
    'justizvollzug',
    'katastrophen- und zivilschutz',
    'ordnungsrecht',
    'polizei',
    'recht',
    'strafrecht',
    'verfassungsgerichtsbarkeit',
    'verfassungsschutz, spionage',
    'zivilrecht',
    'öffentliches recht',
    'glücksspiel',
  ],
  'Demokratie, Staat & Verwaltung': [
    'abgeordnete',
    'bundesregierung',
    'ideologien',
    'landesregierung',
    'menschenrechte',
    'nation',
    'parlament',
    'politische kräfte',
    'staatsaufbau',
    'statistik',
    'wahlen',
    'öffentliche verwaltung',
    'öffentlicher dienst',
  ],
  'Haushalt & Finanzen': [
    'abgaben',
    'finanzmarkt',
    'finanzverwaltung',
    'haushaltskontrolle',
    'vermögen',
    'öffentliche schulden',
    'öffentliche vergabe',
    'öffentlicher haushalt',
    'öffentliches vermögen',
  ],
  Kommunales: ['finanzausgleich', 'kommunale angelegenheiten'],
  'Digitales & Medien': [
    'datenschutz',
    'film, video',
    'informations- und kommunikationstechnologien',
    'informationsgesellschaft, medien',
    'printmedien',
    'rundfunk, fernsehen',
    'urheberschutz',
  ],
  'Kultur, Sport & Freizeit': ['freizeit', 'kunst, kultur', 'sport'],
  'Europa & Internationales': [
    'außenpolitik',
    'entwicklungszusammenarbeit',
    'europapolitik',
    'europäische union',
    'internationale beziehungen',
    'internationale organisationen',
    'organe der eu',
    'programme der eu',
    'rüstung',
    'verteidigung',
  ],
};

const FELD_BY_SACHGEBIET = new Map(
  Object.entries(POLITIKFELDER).flatMap(([feld, sachgebiete]) =>
    sachgebiete.map((s) => [s, feld] as const)
  )
);

export const POLITIKFELD_NAMES = Object.keys(POLITIKFELDER);

export function normalizeSachgebiet(sachgebiet: string): string {
  return sachgebiet.trim().toLocaleLowerCase('de-DE');
}

/** Politikfeld eines Sachgebiets, `null` für eines, das die Tabelle nicht kennt. */
export function politikfeldOf(sachgebiet: string): string | null {
  return FELD_BY_SACHGEBIET.get(normalizeSachgebiet(sachgebiet)) ?? null;
}

/** Die Politikfelder einer Systematik-Liste, ohne Dubletten, in Reihenfolge. */
export function politikfelderOf(systematik: readonly string[]): string[] {
  const felder = systematik.map(politikfeldOf).filter((f): f is string => f !== null);
  return [...new Set(felder)];
}
