/**
 * Politikfelder für das Abgeordnetenhaus — dieselben Namen wie im Landtag NRW
 * (`LandtagNrwScraper/politikfelder.ts`), damit der Filter in beiden Notebooks
 * gleich heißt.
 *
 * PARDOK vergibt je Dokument ein Sachgebiet aus über 1.100 Begriffen („Friedhof",
 * „Ärztlicher Notdienst") — zu viele für eine Tabelle wie in NRW. Die Zuordnung
 * läuft deshalb über Wortstämme, und zwar über das Sachgebiet UND über die
 * Senatsverwaltungen und Ausschüsse, die ein Dokument tragen: die sind nach
 * Ressorts benannt und decken ab, was am Sachgebiet nicht hängen bleibt.
 * `politikfelder.vitest.ts` misst die Abdeckung an echten Einträgen.
 */

/** Schlüssel: genau die `POLITIKFELD_NAMES` des Landtags NRW (geprüft in `politikfelder.vitest.ts`). */
export const STAEMME: Record<string, readonly string[]> = {
  'Klima, Energie & Umwelt': [
    'heiz',
    'klima',
    'umwelt',
    'energie',
    'naturschutz',
    'abfall',
    'abwasser',
    'wasser',
    'baum',
    'grünfläche',
    'lärm',
    'luft',
    'solar',
    'wärme',
    'artenschutz',
    'tierschutz',
  ],
  'Landwirtschaft, Ernährung & Verbraucherschutz': [
    'verbraucher',
    'ernährung',
    'lebensmittel',
    'landwirtschaft',
    'kleingarten',
  ],
  'Verkehr & Mobilität': [
    'omnibus',
    'elektrofahrzeug',
    'taxi',
    'verkehr',
    'mobilität',
    'radweg',
    'fahrrad',
    'straße',
    'straßenbahn',
    'bahn',
    'brücke',
    'parken',
    'flughafen',
    'nahverkehr',
  ],
  'Bauen, Wohnen & Stadtentwicklung': [
    'immobilie',
    'vorkaufsrecht',
    'stadtentwicklung',
    'städtebau',
    'stadtplanung',
    'bauplanung',
    'bebauungsplan',
    'wohn',
    'miet',
    'bauen',
    'baustelle',
    'gebäude',
    'liegenschaft',
    'grundstück',
  ],
  'Wirtschaft & Arbeit': [
    'tarif',
    'lohn',
    'vergabe',
    'wirtschaft',
    'arbeit',
    'betriebe',
    'unternehmen',
    'beschäftigung',
    'ausbildung',
    'tourismus',
    'handel',
    'mindestlohn',
  ],
  'Bildung & Schule': [
    'unterricht',
    'bildung',
    'schul',
    'lehrer',
    'kindertagesstätte',
    'kita',
    'jugend',
  ],
  'Wissenschaft & Forschung': ['wissenschaft', 'forschung', 'hochschul', 'universität', 'studie'],
  'Gesundheit & Pflege': [
    'impf',
    'droge',
    'rettungswesen',
    'gesundheit',
    'pflege',
    'krankenhaus',
    'ärzt',
    'medizin',
    'covid',
    'drogen',
    'sucht',
    'notdienst',
    'rettungsdienst',
  ],
  'Soziales, Familie & Gleichstellung': [
    'inklusion',
    'barrierefrei',
    'lsbttiq',
    'älterer mensch',
    'rassismus',
    'antisemitismus',
    'soziales',
    'sozial',
    'familie',
    'gleichstellung',
    'frauen',
    'antidiskriminierung',
    'vielfalt',
    'wohnungslos',
    'obdachlos',
    'armut',
    'senioren',
    'behinderung',
    'kinder',
  ],
  'Migration, Integration & Religion': [
    'abschiebung',
    'staatsangehörigkeit',
    'aufenthalt',
    'notunterkunft',
    'integration',
    'flüchtling',
    'migration',
    'asyl',
    'ausländer',
    'religion',
    'kirche',
  ],
  'Innere Sicherheit & Justiz': [
    'sexualdelikt',
    'häusliche gewalt',
    'waffe',
    'glücksspiel',
    'richter',
    'demonstration',
    'gewaltprävention',
    'inneres',
    'polizei',
    'sicherheit',
    'justiz',
    'kriminalität',
    'strafvollzug',
    'feuerwehr',
    'katastrophenschutz',
    'verfassungsschutz',
    'gericht',
    'extremismus',
  ],
  'Demokratie, Staat & Verwaltung': [
    'untersuchungsausschuss',
    'grundgesetz',
    'volksabstimmung',
    'enquete',
    'ordnungsruf',
    'staatsvertrag',
    'regierende',
    'rechtsvorschrift',
    'besoldung',
    'beamte',
    'verwaltung',
    'personal',
    'wahl',
    'verfassung',
    'geschäftsordnung',
    'abgeordnete',
    'parlament',
    'senatskanzlei',
    'demokratie',
    'beteiligung',
    'engagement',
  ],
  Kommunales: ['bezirk', 'kommunal'],
  'Haushalt & Finanzen': [
    'öffentliche mittel',
    'haushalt',
    'finanzen',
    'steuer',
    'vermögen',
    'beteiligungsmanagement',
  ],
  'Digitales & Medien': [
    'software',
    'rundfunk',
    'e-government',
    'kommunikationstechnik',
    'digital',
    'datenschutz',
    'medien',
    'informationstechnik',
    'it-',
    'internet',
  ],
  'Kultur, Sport & Freizeit': [
    'kultur',
    'sport',
    'schwimmbad',
    'museum',
    'theater',
    'bibliothek',
    'gedenk',
    'denkmal',
  ],
  'Europa & Internationales': ['europa', 'bundesangelegenheiten', 'international', 'partnerstadt'],
};

/** „Hauptausschuss" und Fraktionen sagen nichts über das Thema. */
const OHNE_THEMA = /^(hauptausschuss|cdu|spd|grüne|die linke|afd|fdp|bsw|fraktionslos)/;

/**
 * Die Vorsilbe einer Stelle („Senatsverwaltung für …", „Ausschuss für …") ist
 * keine Aussage über das Thema — mit ihr fiele jede Antwort des Senats unter
 * „Verwaltung".
 */
const STELLEN_VORSILBE =
  /^(der |die )?(senatsverwaltung|(regierende[rn]? )?bürgermeister(in)?( und senator(in)?)?|senator(in)?|(unter)?ausschuss) für /;

/**
 * Politikfelder aus Sachgebiet und tragenden Stellen, ohne Dubletten, in der
 * Reihenfolge der Tabelle.
 */
export function berlinPolitikfelderOf(
  sachgebiete: readonly string[],
  stellen: readonly string[]
): string[] {
  const texte = [
    ...sachgebiete.map((t) => t.toLocaleLowerCase('de-DE')),
    ...stellen
      .map((t) => t.toLocaleLowerCase('de-DE'))
      .filter((t) => !OHNE_THEMA.test(t))
      .map((t) => t.replace(STELLEN_VORSILBE, '')),
  ];
  return Object.entries(STAEMME)
    .filter(([, staemme]) => texte.some((t) => staemme.some((s) => t.includes(s))))
    .map(([feld]) => feld);
}
