/**
 * Retrieval eval cases: German queries with expected hits, per system collection.
 *
 * An expectation matches a result when its titlePattern (against `title`) OR
 * urlPattern (against `source_url`) matches, case-insensitive. Patterns target
 * stable document identity (program titles, wiki article names) — not chunk
 * content, which would make every retrieved result trivially "relevant".
 *
 * The gold labels are best-effort until calibrated against the live index:
 * run with EVAL_VERBOSE=1, inspect the printed top-5 titles for misses, and
 * tighten patterns where the corpus names things differently.
 */

export interface RetrievalExpectation {
  titlePattern?: string;
  urlPattern?: string;
}

export interface RetrievalCase {
  id: string;
  collection: string;
  query: string;
  expect: RetrievalExpectation[];
}

export const RETRIEVAL_CASES: RetrievalCase[] = [
  // ── grundsatz-system (Grundsatzprogramm, Wahlprogramme, BDK-Beschlüsse) ──
  {
    id: 'grundsatz-oekologie',
    collection: 'grundsatz-system',
    query: 'Was sagt das Grundsatzprogramm zum Verhältnis von Ökologie und Ökonomie?',
    expect: [{ titlePattern: 'Grundsatzprogramm' }],
  },
  {
    id: 'grundsatz-wuerde',
    collection: 'grundsatz-system',
    query: 'Warum heißt das Grundsatzprogramm „zu achten und zu schützen"?',
    expect: [{ titlePattern: 'Grundsatzprogramm|achten' }],
  },
  {
    id: 'grundsatz-btw25-klima',
    collection: 'grundsatz-system',
    query: 'Klimaschutz-Forderungen im Wahlprogramm zur Bundestagswahl 2025',
    expect: [{ titlePattern: 'Bundestagswahl|Regierungsprogramm|Wahlprogramm' }],
  },
  {
    id: 'grundsatz-btw25-wirtschaft',
    collection: 'grundsatz-system',
    query: 'Was plant die Partei laut Bundestagswahlprogramm für die Wirtschaft und Investitionen?',
    expect: [{ titlePattern: 'Bundestagswahl|Regierungsprogramm|Wahlprogramm' }],
  },
  {
    id: 'grundsatz-europa',
    collection: 'grundsatz-system',
    query: 'Positionen aus dem Europawahlprogramm 2024',
    expect: [{ titlePattern: 'Europawahl|Europa' }],
  },
  {
    id: 'grundsatz-grundsicherung',
    collection: 'grundsatz-system',
    query: 'Kindergrundsicherung und soziale Garantien in den Programmen',
    expect: [
      { titlePattern: 'Wahlprogramm|Grundsatzprogramm|Bundestagswahl|Kindergrundsicherung' },
    ],
  },
  {
    id: 'grundsatz-frieden',
    collection: 'grundsatz-system',
    query: 'Haltung zu Friedenspolitik und Auslandseinsätzen der Bundeswehr',
    expect: [{ titlePattern: 'Grundsatzprogramm|Wahlprogramm|Frieden|Sicherheit' }],
  },
  {
    id: 'grundsatz-klimaneutral',
    collection: 'grundsatz-system',
    query: 'Bis wann soll Deutschland klimaneutral werden?',
    expect: [{ titlePattern: 'Wahlprogramm|Grundsatzprogramm|Bundestagswahl|Klima' }],
  },
  {
    id: 'grundsatz-verkehrswende',
    collection: 'grundsatz-system',
    query: 'Forderungen zur Verkehrswende und zum Ausbau der Bahn',
    expect: [{ titlePattern: 'Wahlprogramm|Bundestagswahl|Mobilität|Verkehr' }],
  },
  {
    id: 'grundsatz-mindestlohn',
    collection: 'grundsatz-system',
    query: 'Position zum Mindestlohn',
    expect: [{ titlePattern: 'Wahlprogramm|Bundestagswahl|Regierungsprogramm|Arbeit' }],
  },
  {
    id: 'grundsatz-buergerversicherung',
    collection: 'grundsatz-system',
    query: 'Was ist die Bürgerversicherung und wer soll einzahlen?',
    expect: [{ titlePattern: 'Wahlprogramm|Bundestagswahl|Gesundheit|Bürgerversicherung' }],
  },
  {
    id: 'grundsatz-wahlrecht16',
    collection: 'grundsatz-system',
    query: 'Absenkung des Wahlalters auf 16 Jahre',
    expect: [{ titlePattern: 'Wahlprogramm|Bundestagswahl|Demokratie|Wahlalter' }],
  },

  // ── gruene-de-system (gruene.de Artikel & Themenseiten) ──
  {
    id: 'gruene-de-waermepumpe',
    collection: 'gruene-de-system',
    query: 'Förderung beim Heizungstausch und Wärmepumpen',
    expect: [{ titlePattern: 'Heizung|Wärme' }, { urlPattern: 'heiz|waerme' }],
  },
  {
    id: 'gruene-de-vielfalt',
    collection: 'gruene-de-system',
    query: 'Einsatz gegen Rechtsextremismus und für eine vielfältige Gesellschaft',
    expect: [
      { titlePattern: 'Rechtsextrem|Vielfalt|Demokratie' },
      { urlPattern: 'rechtsextrem|vielfalt|demokratie' },
    ],
  },
  {
    id: 'gruene-de-frauentag',
    collection: 'gruene-de-system',
    query: 'Gleichberechtigung und feministische Politik',
    expect: [
      { titlePattern: 'Frauen|Gleichberechtigung|Feminis' },
      { urlPattern: 'frauen|gleichstellung|feminis' },
    ],
  },
  {
    id: 'gruene-de-energie',
    collection: 'gruene-de-system',
    query: 'Ausbau der erneuerbaren Energien in Deutschland',
    expect: [
      { titlePattern: 'Erneuerbare|Energie|Solar|Wind' },
      { urlPattern: 'energie|erneuerbare|solar|wind' },
    ],
  },
  {
    id: 'gruene-de-artenschutz',
    collection: 'gruene-de-system',
    query: 'Artenvielfalt und Naturschutz',
    expect: [{ titlePattern: 'Arten|Natur|Biodiversität' }, { urlPattern: 'arten|natur|biodiv' }],
  },
  {
    id: 'gruene-de-vorsitz',
    collection: 'gruene-de-system',
    query: 'Wer ist im Bundesvorstand der Partei?',
    expect: [
      { titlePattern: 'Bundesvorstand|Vorsitzende' },
      { urlPattern: 'bundesvorstand|vorsitz|partei/leute|menschen' },
    ],
  },
  {
    id: 'gruene-de-mitglied',
    collection: 'gruene-de-system',
    query: 'Wie kann ich Mitglied werden?',
    expect: [{ titlePattern: 'Mitglied' }, { urlPattern: 'mitglied' }],
  },
  {
    id: 'gruene-de-europa',
    collection: 'gruene-de-system',
    query: 'Europapolitik und die Rolle der EU',
    expect: [{ titlePattern: 'Europa|EU' }, { urlPattern: 'europa|eu-' }],
  },

  // ── kommunalwiki-system (KommunalWiki der Böll-Stiftung) ──
  {
    id: 'kommunalwiki-buergerbegehren',
    collection: 'kommunalwiki-system',
    query: 'Wie funktioniert ein Bürgerbegehren in der Kommune?',
    expect: [{ titlePattern: 'Bürgerbegehren|Bürgerentscheid' }],
  },
  {
    id: 'kommunalwiki-bebauungsplan',
    collection: 'kommunalwiki-system',
    query: 'Aufstellung eines Bebauungsplans — Verfahren und Beteiligung',
    expect: [{ titlePattern: 'Bebauungsplan|Bauleitplan' }],
  },
  {
    id: 'kommunalwiki-radverkehr',
    collection: 'kommunalwiki-system',
    query: 'Radverkehrsförderung in der Kommunalpolitik',
    expect: [{ titlePattern: 'Radverkehr|Fahrrad|Rad' }],
  },
  {
    id: 'kommunalwiki-haushalt',
    collection: 'kommunalwiki-system',
    query: 'Wie liest man einen kommunalen Haushaltsplan?',
    expect: [{ titlePattern: 'Haushalt' }],
  },
  {
    id: 'kommunalwiki-waermeplanung',
    collection: 'kommunalwiki-system',
    query: 'Kommunale Wärmeplanung umsetzen',
    expect: [{ titlePattern: 'Wärmeplanung|Wärme' }],
  },
  {
    id: 'kommunalwiki-fraktion',
    collection: 'kommunalwiki-system',
    query: 'Rechte und Arbeit einer Fraktion im Gemeinderat',
    expect: [{ titlePattern: 'Fraktion|Gemeinderat|Rat' }],
  },
  {
    id: 'kommunalwiki-vergabe',
    collection: 'kommunalwiki-system',
    query: 'Öffentliche Vergabe und Ausschreibungen in Kommunen',
    expect: [{ titlePattern: 'Vergabe|Ausschreibung' }],
  },
  {
    id: 'kommunalwiki-jugend',
    collection: 'kommunalwiki-system',
    query: 'Jugendbeteiligung in der Kommune',
    expect: [{ titlePattern: 'Jugend' }],
  },
  {
    id: 'kommunalwiki-laerm',
    collection: 'kommunalwiki-system',
    query: 'Lärmaktionsplanung und Lärmschutz vor Ort',
    expect: [{ titlePattern: 'Lärm' }],
  },
  {
    id: 'kommunalwiki-baum',
    collection: 'kommunalwiki-system',
    query: 'Baumschutzsatzung und Stadtgrün',
    expect: [{ titlePattern: 'Baum|Stadtgrün|Grünfläche|Urbanes Grün|Satzungsrecht' }],
  },

  // ── oesterreich-gruene-system (Programme der österreichischen Grünen) ──
  {
    id: 'at-grundsatz',
    collection: 'oesterreich-gruene-system',
    query: 'Grundwerte im Grundsatzprogramm der österreichischen Grünen',
    expect: [{ titlePattern: 'Grundsatzprogramm|Grundsatz' }],
  },
  {
    id: 'at-nrw-klima',
    collection: 'oesterreich-gruene-system',
    query: 'Klimaschutz im Wahlprogramm zur Nationalratswahl',
    expect: [{ titlePattern: 'Nationalratswahl|Wahlprogramm|Klima' }],
  },
  {
    id: 'at-bodenverbrauch',
    collection: 'oesterreich-gruene-system',
    query: 'Bodenverbrauch und Bodenversiegelung in Österreich stoppen',
    expect: [{ titlePattern: 'Boden|Wahlprogramm|Nationalratswahl' }],
  },
  {
    id: 'at-kinderbetreuung',
    collection: 'oesterreich-gruene-system',
    query: 'Rechtsanspruch auf Kinderbetreuung in Österreich',
    expect: [{ titlePattern: 'Kinder|Wahlprogramm|Nationalratswahl|Bildung' }],
  },
  {
    id: 'at-klimaticket',
    collection: 'oesterreich-gruene-system',
    query: 'Klimaticket und öffentlicher Verkehr',
    expect: [{ titlePattern: 'Klimaticket|Verkehr|Mobilität|Wahlprogramm' }],
  },
  {
    id: 'at-korruption',
    collection: 'oesterreich-gruene-system',
    query: 'Maßnahmen gegen Korruption und für saubere Politik',
    expect: [{ titlePattern: 'Korruption|Transparenz|Kontrolle|Wahlprogramm' }],
  },

  // ── landesverbaende (bayern-system / berlin-system) ──
  {
    id: 'bayern-flaechenfrass',
    collection: 'bayern-system',
    query: 'Flächenverbrauch und Flächenfraß in Bayern begrenzen',
    expect: [{ titlePattern: 'Fläche|Boden' }, { urlPattern: 'flaeche|boden' }],
  },
  {
    id: 'bayern-artenvielfalt',
    collection: 'bayern-system',
    query: 'Volksbegehren Artenvielfalt — Rettet die Bienen',
    expect: [{ titlePattern: 'Arten|Bienen|Volksbegehren' }, { urlPattern: 'arten|bienen' }],
  },
  {
    id: 'bayern-wahlprogramm',
    collection: 'bayern-system',
    query: 'Kernforderungen im Landtagswahlprogramm Bayern',
    expect: [{ titlePattern: 'Landtagswahl|Wahlprogramm|Regierungsprogramm' }],
  },
  {
    id: 'berlin-mieten',
    collection: 'berlin-system',
    query: 'Mietenpolitik und bezahlbares Wohnen in Berlin',
    expect: [{ titlePattern: 'Miet|Wohn' }, { urlPattern: 'miet|wohn' }],
  },
  {
    id: 'berlin-verkehr',
    collection: 'berlin-system',
    query: 'Ausbau von Radwegen und ÖPNV in Berlin',
    expect: [
      { titlePattern: 'Rad|Verkehr|Mobilität|ÖPNV' },
      { urlPattern: 'rad|verkehr|mobilitaet' },
    ],
  },
  {
    id: 'berlin-wahlprogramm',
    collection: 'berlin-system',
    query: 'Wahlprogramm zur Wahl des Abgeordnetenhauses',
    expect: [{ titlePattern: 'Wahlprogramm|Abgeordnetenhaus|Landtagswahl' }],
  },

  // ── boell-stiftung-system ──
  {
    id: 'boell-demokratie',
    collection: 'boell-stiftung-system',
    query: 'Studien zur Stärkung der Demokratie',
    expect: [{ titlePattern: 'Demokratie' }, { urlPattern: 'demokratie' }],
  },
  {
    id: 'boell-atlas',
    collection: 'boell-stiftung-system',
    query: 'Fakten aus einem Atlas der Böll-Stiftung, zum Beispiel zu Fleisch oder Mobilität',
    expect: [{ titlePattern: 'Atlas' }, { urlPattern: 'atlas' }],
  },
  {
    id: 'boell-feminismus',
    collection: 'boell-stiftung-system',
    query: 'Geschlechtergerechtigkeit und feministische Außenpolitik',
    expect: [
      { titlePattern: 'Feminis|Geschlecht|Gender' },
      { urlPattern: 'feminis|gender|geschlecht' },
    ],
  },
  {
    id: 'boell-klimagerechtigkeit',
    collection: 'boell-stiftung-system',
    query: 'Internationale Klimagerechtigkeit und Klimafinanzierung',
    expect: [{ titlePattern: 'Klima' }, { urlPattern: 'klima' }],
  },

  // ── gruenblog-system ──
  {
    id: 'gruenblog-netzpolitik',
    collection: 'gruenblog-system',
    query: 'Digitalisierung und Netzpolitik im Grünblog',
    expect: [{ titlePattern: 'Digital|Netz' }, { urlPattern: 'digital|netz' }],
  },
  {
    id: 'gruenblog-partei',
    collection: 'gruenblog-system',
    query: 'Debatte über die strategische Ausrichtung der Partei',
    expect: [{ titlePattern: 'Strategie|Partei|Kurs' }, { urlPattern: 'strategie|partei' }],
  },

  // ── gruene-at-system (Website der österreichischen Grünen) ──
  {
    id: 'gruene-at-klima',
    collection: 'gruene-at-system',
    query: 'Klimapolitik der Grünen in Österreich',
    expect: [{ titlePattern: 'Klima' }, { urlPattern: 'klima' }],
  },
  {
    id: 'gruene-at-team',
    collection: 'gruene-at-system',
    query: 'Wer sitzt für die Grünen im Nationalrat?',
    expect: [
      { titlePattern: 'Nationalrat|Abgeordnete|Team|Menschen' },
      { urlPattern: 'nationalrat|team|menschen|abgeordnete' },
    ],
  },
  {
    id: 'gruene-at-energiewende',
    collection: 'gruene-at-system',
    query: 'Energiewende und Ausstieg aus Öl und Gas in Österreich',
    expect: [{ titlePattern: 'Energie|Gas|Öl' }, { urlPattern: 'energie' }],
  },
  {
    id: 'gruene-at-frauen',
    collection: 'gruene-at-system',
    query: 'Frauenpolitik und Gewaltschutz in Österreich',
    expect: [{ titlePattern: 'Frauen|Gewalt' }, { urlPattern: 'frauen|gewalt' }],
  },
];
