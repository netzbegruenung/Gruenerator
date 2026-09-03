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
 *
 * `notebook` cases run the notebook Q&A scope through
 * `NotebookQAService.getSearchContext` (default depth `deep`) instead of the
 * flat document search: `notebook.collectionId` / `notebook.collectionIds`
 * select the scope, `notebook.user` stubs a synthetic user notebook (the two
 * table PDFs no real notebook collection holds), `notebook.history` feeds
 * conversation turns into the query construction — only effective when the
 * depth profile allows history (deep does not, at baseline), which is exactly
 * the gap the follow-up cases measure.
 */

export interface RetrievalExpectation {
  titlePattern?: string;
  urlPattern?: string;
}

/**
 * `qa` cases are natural-language questions as the notebook Q&A asks them.
 * `manual` cases are the keyword lookups people type into the notebook search
 * field — a different retrieval problem, because the winning document is the
 * one that literally carries the term, not the one that is topically nearest.
 */
export type RetrievalCaseKind = 'qa' | 'manual' | 'notebook' | 'chat-notebook';

/** Search scope + context of a notebook case (see `notebookStreamCore`). */
export interface NotebookCaseMeta {
  collectionId?: string;
  collectionIds?: string[];
  /**
   * Synthetic user notebook: the runner stubs `getCollectionFn` /
   * `getDocumentIdsFn` with this (no DB access, `user_id: 'SYSTEM'` bypasses
   * the access check).
   */
  user?: { collectionId: string; name: string; documentIds: string[] };
  /** Conversation turns preceding the query (user/assistant alternation). */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Notebook-Bindung eines CHAT-seitigen Falls — der Pfad in `searchNode`, nicht
 * die Notebook-Fläche. Der Unterschied ist nicht kosmetisch: `searchNode` holt
 * gruppierte Dokumente über `executeDirectSearch` mit sammlungseigenen
 * Schwellen und einem 800-Zeichen-Auszug, die Fläche geht über
 * `NotebookQAService.getSearchContext`. Deshalb eine eigene Sorte statt eines
 * Feldes an `NotebookCaseMeta`.
 */
export interface ChatNotebookCaseMeta {
  /** Wie im Chat: `@mention`-IDs. Aufgelöst über NOTEBOOK_COLLECTION_MAP. */
  notebookIds: string[];
  /**
   * Vorangehende Turns. Nur diese Fälle laufen durch `refineSearchQuery` —
   * genau wie `classifyWithForcedSearch` es auf dem Mention-Pfad tut. Ohne
   * Verlauf ist die Fallanfrage bereits das Thema (wie bei `qa` und `notebook`).
   */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface RetrievalCase {
  id: string;
  collection: string;
  query: string;
  expect: RetrievalExpectation[];
  /** Defaults to `qa`. */
  kind?: RetrievalCaseKind;
  notebook?: NotebookCaseMeta;
  chatNotebook?: ChatNotebookCaseMeta;
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

  // ── Stichwort-Fälle (`kw-`): der Pfad, den die dichte Einbettung nicht sieht ──
  //
  // Every query here carries at least one token a person actually types — a
  // term of art, a paragraph or article number, a proper name, an
  // abbreviation, a figure. That is what the sparse (BM25) arm is for; the 52
  // cases above are semantic questions the dense embedding already answers, so
  // they cannot tell the two arms apart. `EVAL_FILTER=kw-` isolates this set.
  //
  // Each term was located in the live collection before the expectation was
  // written (scroll on `chunk_text`, one document key per `document_id`), and
  // accepted only when it matched 1–3 documents there. The comment on each
  // case records that count. Where the gold title does NOT carry the term, the
  // case is a genuine sparse test rather than a title match in disguise.
  {
    id: 'kw-grundsatz-paragraf-218',
    collection: 'grundsatz-system',
    query: '§ 218 StGB Schwangerschaftsabbruch',
    // Occurs in exactly one document.
    expect: [{ titlePattern: 'Regierungsprogramm' }],
  },
  {
    id: 'kw-grundsatz-tariftreuegesetz',
    collection: 'grundsatz-system',
    query: 'Tariftreuegesetz öffentliche Aufträge',
    // Occurs in exactly one document.
    expect: [{ titlePattern: 'Regierungsprogramm' }],
  },
  {
    id: 'kw-grundsatz-anthropozaen',
    collection: 'grundsatz-system',
    query: 'Anthropozän',
    // Occurs in exactly one document — the only one of the three programmes
    // that uses the word at all.
    expect: [{ titlePattern: 'Grundsatzprogramm' }],
  },
  {
    id: 'kw-grundsatz-bologna-prozess',
    collection: 'grundsatz-system',
    query: 'Bologna-Prozess Studienabschlüsse',
    // Occurs in exactly one document.
    expect: [{ titlePattern: 'EU-Wahlprogramm' }],
  },
  {
    id: 'kw-kommunalwiki-art-28-gg',
    collection: 'kommunalwiki-system',
    query: 'Art. 28 GG Allzuständigkeit',
    // The citation occurs in exactly one of 1 707 documents. The pattern is
    // anchored because a sibling article is called "Kommunale Selbstverwaltung
    // sieht anders aus".
    expect: [{ titlePattern: '^Kommunale Selbstverwaltung$' }],
  },
  {
    id: 'kw-kommunalwiki-waermeplanungsgesetz',
    collection: 'kommunalwiki-system',
    query: 'Wärmeplanungsgesetz',
    // Occurs in exactly one document, whose title does not carry the term.
    expect: [{ titlePattern: 'Klimaschutz als kommunale Pflichtaufgabe' }],
  },
  {
    id: 'kw-kommunalwiki-erhaltungssatzung',
    collection: 'kommunalwiki-system',
    query: 'Erhaltungssatzung Milieuschutzsatzung',
    // Occurs in exactly one document, whose title does not carry the term.
    expect: [{ titlePattern: 'Vorkaufsrecht der Gemeinde' }],
  },
  {
    id: 'kw-kommunalwiki-pfas',
    collection: 'kommunalwiki-system',
    query: 'PFAS Grenzwerte Trinkwasser',
    // Two documents carry the abbreviation; 24 of 26 chunks are the article
    // named after it, the other two are a link list ("Interaktive Karten").
    expect: [{ titlePattern: 'Per- und polyfluorierte Alkylverbindungen' }],
  },
  {
    id: 'kw-gruene-de-paragraf-218',
    collection: 'gruene-de-system',
    query: '§ 218 StGB Beratungsbescheinigung',
    // Occurs in exactly one document.
    expect: [{ titlePattern: 'Neuregelung von Schwangerschaftsabbrüchen' }],
  },
  {
    id: 'kw-gruene-de-urabstimmung',
    collection: 'gruene-de-system',
    query: 'Urabstimmung der Mitglieder',
    // Occurs in exactly one document, whose title does not carry the term.
    expect: [{ titlePattern: 'Koalitionsvertrag: Mehr Fortschritt wagen' }],
  },
  {
    id: 'kw-gruene-de-lieferkettengesetz',
    collection: 'gruene-de-system',
    query: 'Lieferkettengesetz Lieferkettenrichtlinie',
    // Occurs in exactly one document, whose title names neither.
    expect: [{ titlePattern: 'Schulterschluss mit Rechtsextremen' }],
  },
  {
    id: 'kw-at-klimabonus',
    collection: 'oesterreich-gruene-system',
    query: 'Klimabonus und CO2-Preis',
    // Occurs in exactly one of the three programmes.
    expect: [{ titlePattern: 'Wahlprogramm Nationalratswahl 2024' }],
  },
  {
    id: 'kw-at-zwentendorf',
    collection: 'oesterreich-gruene-system',
    query: 'Zwentendorf Hainburger Au',
    // Both proper names occur in exactly one document — the 2001 programme,
    // not the two 2024 ones a topical search lands on.
    expect: [{ titlePattern: 'Grundsatzprogramm der Grünen' }],
  },
  {
    id: 'kw-at-fit-for-55',
    collection: 'oesterreich-gruene-system',
    query: 'Fit for 55 Emissionshandel',
    // Occurs in exactly one of the three programmes.
    expect: [{ titlePattern: 'EU-Wahlprogramm 2024' }],
  },
  {
    id: 'kw-gruene-at-orf-beitrag',
    collection: 'gruene-at-system',
    query: 'ORF-Beitrag',
    // Occurs in exactly one document, whose title carries "ORF" but not the
    // compound.
    expect: [{ titlePattern: 'fairer Beitrag für einen starken ORF' }],
  },
  {
    id: 'kw-gruene-at-maklerprovision',
    collection: 'gruene-at-system',
    query: 'Maklerprovision Miete wer zahlt',
    // Occurs in exactly one document — which spells its title
    // "Maklerinnenprovision", so the query token is not in the title.
    expect: [{ titlePattern: 'Maklerinnenprovision' }],
  },
  {
    id: 'kw-boell-carbon-bubble',
    collection: 'boell-stiftung-system',
    query: 'Carbon Bubble',
    // Occurs in exactly one of 330 documents.
    expect: [{ titlePattern: 'Carbon Bubble' }],
  },
  {
    id: 'kw-boell-bergkarabach',
    collection: 'boell-stiftung-system',
    query: 'Bergkarabach-Krieg 2020',
    // Occurs in exactly one document, whose title does not carry the name.
    expect: [{ titlePattern: 'Armenien vor der Wahl' }],
  },
  {
    id: 'kw-bayern-anbindegebot',
    collection: 'bayern-system',
    query: 'Anbindegebot Lockerung',
    // Occurs in exactly one of the 1 100 Bavarian documents; the title carries
    // the figure the article is about, not the term of art.
    expect: [{ titlePattern: 'Flächenfraß steigt auf 11,6 Hektar' }],
  },
  {
    id: 'kw-berlin-rummelsburger-bucht',
    collection: 'berlin-system',
    query: 'Rummelsburger Bucht Kulturhafen',
    // Occurs in exactly one of the 1 468 Berlin documents — a Wahlprüfstein
    // answer whose title names neither the place nor the topic.
    expect: [{ titlePattern: '20210813_Grüne Antworten_WPS_Bürgerforum Stralau' }],
  },

  // ── Manuelle Recherche: Stichwortsuche im Notebook-Suchfeld ──
  //
  // Gold labels were read off the live index (scroll on `chunk_text`), so each
  // one is a fact about the corpus, not a guess: either the term occurs in
  // exactly one document, or the expected title carries the term literally.
  // A keyword query whose literal match ranks below a merely topical neighbour
  // is the failure these cases exist to catch.
  {
    id: 'manual-berlin-hitzeschutz',
    collection: 'berlin-system',
    query: 'Hitzeschutz',
    // 33 chunks across 20 documents; six carry it in the title, the strongest
    // (5 chunks) is "Hitzeschutz für alle Berliner*innen".
    expect: [{ titlePattern: 'Hitzeschutz' }],
    kind: 'manual',
  },
  {
    id: 'manual-berlin-baumfaellmoratorium',
    collection: 'berlin-system',
    query: 'Baumfäll-Moratorium',
    // Occurs in exactly one document.
    expect: [{ titlePattern: 'Baumfäll-Moratorium' }],
    kind: 'manual',
  },
  {
    id: 'manual-berlin-milieuschutz',
    collection: 'berlin-system',
    query: 'Milieuschutz',
    expect: [{ titlePattern: 'Wohnungspolitik|Milieuschutz|Mieten' }],
    kind: 'manual',
  },
  {
    id: 'manual-bayern-moorschutz',
    collection: 'bayern-system',
    query: 'Moorschutz',
    expect: [{ titlePattern: 'Moorschutz' }],
    kind: 'manual',
  },
  {
    id: 'manual-bayern-nationalpark',
    collection: 'bayern-system',
    query: 'Nationalpark',
    expect: [{ titlePattern: 'Nationalpark' }],
    kind: 'manual',
  },
  {
    id: 'manual-grundsatz-kindergrundsicherung',
    collection: 'grundsatz-system',
    query: 'Kindergrundsicherung',
    // Occurs in exactly one document.
    expect: [{ titlePattern: 'Grundsatzprogramm' }],
    kind: 'manual',
  },
  {
    id: 'manual-grundsatz-schuldenbremse',
    collection: 'grundsatz-system',
    query: 'Schuldenbremse',
    // Occurs in exactly one document.
    expect: [{ titlePattern: 'Regierungsprogramm' }],
    kind: 'manual',
  },
  {
    id: 'manual-kommunalwiki-baumschutzsatzung',
    collection: 'kommunalwiki-system',
    query: 'Baumschutzsatzung',
    // Occurs in exactly one document.
    expect: [{ titlePattern: 'Satzungsrecht' }],
    kind: 'manual',
  },
  {
    id: 'manual-kommunalwiki-quartiersmanagement',
    collection: 'kommunalwiki-system',
    query: 'Quartiersmanagement',
    // Same mis-curation as the Klimaanpassung case: the term occurs most often
    // in "Bürgerbeteiligung in Mannheim", but the wiki has an article called
    // "Quartiersmanagement", and that is what this query asks for.
    expect: [{ titlePattern: 'Quartiersmanagement' }],
    kind: 'manual',
  },
  {
    id: 'manual-kommunalwiki-klimaanpassung',
    collection: 'kommunalwiki-system',
    query: 'Klimaanpassung',
    // Mis-curated at first: the term occurs in 73 chunks of one link-list
    // article ("Transnationale Klima-Netzwerke"), and picking the document
    // with the most occurrences made that the gold answer. It is not — the
    // articles named after the term are. Occurrence count locates candidates;
    // it does not settle which document a search should return.
    expect: [{ titlePattern: 'Klimaanpassung' }],
    kind: 'manual',
  },
  {
    id: 'manual-gruene-de-heizungsgesetz',
    collection: 'gruene-de-system',
    query: 'Heizungsgesetz',
    expect: [{ titlePattern: 'Heizungsgesetz' }],
    kind: 'manual',
  },
  {
    id: 'manual-at-klimaticket',
    collection: 'oesterreich-gruene-system',
    query: 'Klimaticket',
    // Occurs in exactly one document.
    expect: [{ titlePattern: 'Nationalratswahl|Wahlprogramm' }],
    kind: 'manual',
  },

  // ── notebook scope: NotebookQAService.getSearchContext (EVAL_PIPELINE=notebook) ──
  // Gold labels reuse the calibrated manual golds above (same corpus, same
  // documents). The user-notebook cases scope a synthetic collection around
  // two public municipal table PDFs (audit report + budget plan); neither is
  // part of any real notebook collection, so the document list is the case's
  // own. Both notebooks carry both documents, so each case is a genuine
  // two-document discrimination.
  {
    id: 'notebook-berlin-hitzeschutz',
    collection: 'berlin-system',
    query: 'Was gilt in Berlin zum Hitzeschutz, etwa an Schulen oder für Hitzeempfindliche?',
    expect: [{ titlePattern: 'Hitzeschutz' }],
    kind: 'notebook',
    notebook: { collectionId: 'berlin-system' },
  },
  {
    id: 'notebook-berlin-milieuschutz',
    collection: 'berlin-system',
    query: 'Wie will Berlin mit Milieuschutzgebieten die Mietenentwicklung bremsen?',
    expect: [{ titlePattern: 'Wohnungspolitik|Milieuschutz|Mieten' }],
    kind: 'notebook',
    notebook: { collectionId: 'berlin-system' },
  },
  {
    id: 'notebook-bayern-moorschutz',
    collection: 'bayern-system',
    query: 'Welche Ziele und Maßnahmen verfolgt der Moorschutz in Bayern?',
    expect: [{ titlePattern: 'Moorschutz' }],
    kind: 'notebook',
    notebook: { collectionId: 'bayern-system' },
  },
  {
    id: 'notebook-at-klimaticket',
    collection: 'oesterreich-gruene-system',
    query: 'Wie ist das Klimaticket in Österreich finanziert, und was kostet es?',
    expect: [{ titlePattern: 'Nationalratswahl|Wahlprogramm' }],
    kind: 'notebook',
    notebook: { collectionId: 'oesterreich-gruene-system' },
  },
  {
    id: 'notebook-user-ausschreibungen',
    collection: 'user',
    query:
      'Welche Direktvergabe an ein Architekturbüro hat das Rechnungsprüfungsamt beanstandet, und wie hoch war der Betrag?',
    expect: [{ titlePattern: 'Schlussbericht|Rechnungspruefung' }],
    kind: 'notebook',
    notebook: {
      user: {
        collectionId: '00000000-0000-4000-8000-0000000000a1',
        name: 'Prüfungsbericht Notebook',
        // RPA Schlussbericht Stadt Neustadt a. d. Rübenberge (Direktvergabe
        // 149.614,99 € an ein Architekturbüro) + Eutin Haushaltsplan als Noise.
        documentIds: [
          'bb3c2541-9cf4-4dd9-9b33-88720d7ac5c8',
          '8899154c-04c7-49da-8296-f5d1b8ee6d62',
        ],
      },
    },
  },
  {
    id: 'notebook-user-haushaltsplan',
    collection: 'user',
    query: 'Wie hoch sind die Einzahlungen aus laufender Verwaltungstätigkeit laut Finanzplan?',
    expect: [{ titlePattern: '3152_3711' }],
    kind: 'notebook',
    notebook: {
      user: {
        collectionId: '00000000-0000-4000-8000-0000000000a2',
        name: 'Haushaltsplan Notebook',
        documentIds: [
          'bb3c2541-9cf4-4dd9-9b33-88720d7ac5c8',
          '8899154c-04c7-49da-8296-f5d1b8ee6d62',
        ],
      },
    },
  },
  // Follow-up questions across the Berlin+Bayern multi-collection scope.
  // Only the rewritten standalone query ("Moorschutz in Bayern", …) can hit
  // the gold document; at the deep baseline (history disabled, no rewrite)
  // these are expected misses — the gap the rewrite step exists to close.
  {
    id: 'notebook-history-moorschutz',
    collection: 'multi',
    query: 'Und in Bayern?',
    expect: [{ titlePattern: 'Moorschutz' }],
    kind: 'notebook',
    notebook: {
      collectionIds: ['berlin-system', 'bayern-system'],
      history: [
        { role: 'user', content: 'Was tut Berlin für den Moorschutz?' },
        {
          role: 'assistant',
          content:
            'Berlin engagiert sich für den Schutz von Mooren und deren Wiedervernässung sowie für den Hochwasserschutz im Umland.',
        },
      ],
    },
  },
  {
    id: 'notebook-history-flaechenfrass',
    collection: 'multi',
    query: 'Und in Bayern?',
    expect: [{ titlePattern: 'Fläche|Boden' }],
    kind: 'notebook',
    notebook: {
      collectionIds: ['berlin-system', 'bayern-system'],
      history: [
        { role: 'user', content: 'Wie will Berlin den Flächenfraß begrenzen?' },
        {
          role: 'assistant',
          content:
            'Berlin will den Flächenverbrauch durch Bebauung auf braunen und grauen Flächen sowie durch Verdichtung begrenzen.',
        },
      ],
    },
  },
  {
    id: 'notebook-history-artenvielfalt',
    collection: 'multi',
    query: 'Und in Bayern?',
    expect: [{ titlePattern: 'Arten|Bienen|Volksbegehren' }],
    kind: 'notebook',
    notebook: {
      collectionIds: ['berlin-system', 'bayern-system'],
      history: [
        { role: 'user', content: 'Was plant Berlin für die Artenvielfalt?' },
        {
          role: 'assistant',
          content:
            'Berlin setzt unter anderem auf die Renaturierung von Grünflächen und den Schutz von Bienen und Insekten.',
        },
      ],
    },
  },

  // ── chat-notebook scope: searchNode's notebook-bound branch
  //    (EVAL_PIPELINE=chat-notebook) ──
  // Gold labels reuse the calibrated `qa`/`manual`/`notebook` golds above (same
  // corpus, same documents), so a rank change here is a retrieval change and
  // not a relabelling. `notebookIds` are the ids a user @mentions; resolving
  // them is part of the measured path.
  {
    id: 'chat-nb-berlin-hitzeschutz',
    collection: 'berlin-system',
    query: 'Was gilt in Berlin zum Hitzeschutz, etwa an Schulen oder für Hitzeempfindliche?',
    expect: [{ titlePattern: 'Hitzeschutz' }],
    kind: 'chat-notebook',
    chatNotebook: { notebookIds: ['berlin-notebook'] },
  },
  {
    id: 'chat-nb-berlin-milieuschutz',
    collection: 'berlin-system',
    query: 'Wie will Berlin mit Milieuschutzgebieten die Mietenentwicklung bremsen?',
    expect: [{ titlePattern: 'Wohnungspolitik|Milieuschutz|Mieten' }],
    kind: 'chat-notebook',
    chatNotebook: { notebookIds: ['berlin-notebook'] },
  },
  {
    id: 'chat-nb-berlin-verkehr',
    collection: 'berlin-system',
    query: 'Ausbau von Radwegen und ÖPNV in Berlin',
    expect: [
      { titlePattern: 'Rad|Verkehr|Mobilität|ÖPNV' },
      { urlPattern: 'rad|verkehr|mobilitaet' },
    ],
    kind: 'chat-notebook',
    chatNotebook: { notebookIds: ['berlin-notebook'] },
  },
  {
    id: 'chat-nb-berlin-baumfaellmoratorium',
    collection: 'berlin-system',
    // Occurs in exactly one document — the hardest single-document case in the
    // Berlin corpus, and the one a second formulation can most easily lose.
    query: 'Was steht zum Baumfäll-Moratorium?',
    expect: [{ titlePattern: 'Baumfäll-Moratorium' }],
    kind: 'chat-notebook',
    chatNotebook: { notebookIds: ['berlin-notebook'] },
  },
  {
    id: 'chat-nb-bayern-moorschutz',
    collection: 'bayern-system',
    query: 'Welche Ziele und Maßnahmen verfolgt der Moorschutz in Bayern?',
    expect: [{ titlePattern: 'Moorschutz' }],
    kind: 'chat-notebook',
    chatNotebook: { notebookIds: ['bayern-notebook'] },
  },
  {
    id: 'chat-nb-bayern-artenvielfalt',
    collection: 'bayern-system',
    query: 'Volksbegehren Artenvielfalt — Rettet die Bienen',
    expect: [{ titlePattern: 'Arten|Bienen|Volksbegehren' }, { urlPattern: 'arten|bienen' }],
    kind: 'chat-notebook',
    chatNotebook: { notebookIds: ['bayern-notebook'] },
  },
  {
    id: 'chat-nb-bayern-flaechenfrass',
    collection: 'bayern-system',
    query: 'Flächenverbrauch und Flächenfraß in Bayern begrenzen',
    expect: [{ titlePattern: 'Fläche|Boden' }, { urlPattern: 'flaeche|boden' }],
    kind: 'chat-notebook',
    chatNotebook: { notebookIds: ['bayern-notebook'] },
  },
  {
    id: 'chat-nb-at-klimaticket',
    collection: 'oesterreich-gruene-system',
    // One AT case, not a third topic series: it proves the resolution
    // (oesterreich-notebook opens exactly one collection) and the language
    // choice, nothing else.
    query: 'Wie ist das Klimaticket in Österreich finanziert, und was kostet es?',
    expect: [{ titlePattern: 'Nationalratswahl|Wahlprogramm' }],
    kind: 'chat-notebook',
    chatNotebook: { notebookIds: ['oesterreich-notebook'] },
  },
  // Follow-up questions across the Berlin+Bayern multi-notebook scope. Only the
  // rewritten standalone query can hit the gold document, so these measure the
  // refiner (`refineSearchQuery`) as the mention path runs it — the expansion
  // on top of it is what this PR changes.
  {
    id: 'chat-nb-history-moorschutz',
    collection: 'multi',
    query: 'Und in Bayern?',
    expect: [{ titlePattern: 'Moorschutz' }],
    kind: 'chat-notebook',
    chatNotebook: {
      notebookIds: ['berlin-notebook', 'bayern-notebook'],
      history: [
        { role: 'user', content: 'Was tut Berlin für den Moorschutz?' },
        {
          role: 'assistant',
          content:
            'Berlin engagiert sich für den Schutz von Mooren und deren Wiedervernässung sowie für den Hochwasserschutz im Umland.',
        },
      ],
    },
  },
  {
    id: 'chat-nb-history-artenvielfalt',
    collection: 'multi',
    query: 'Und in Bayern?',
    expect: [{ titlePattern: 'Arten|Bienen|Volksbegehren' }],
    kind: 'chat-notebook',
    chatNotebook: {
      notebookIds: ['berlin-notebook', 'bayern-notebook'],
      history: [
        { role: 'user', content: 'Was plant Berlin für die Artenvielfalt?' },
        {
          role: 'assistant',
          content:
            'Berlin setzt unter anderem auf die Renaturierung von Grünflächen und den Schutz von Bienen und Insekten.',
        },
      ],
    },
  },
];
