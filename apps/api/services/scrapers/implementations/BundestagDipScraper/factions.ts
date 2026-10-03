/**
 * Fraktionsnamen auf eine Kurzform bringen — dieselben Werte, die Bundestag
 * Wrapped in seine Reden-Sammlung schreibt („GRÜNE", nicht „BÜNDNIS 90/DIE
 * GRÜNEN"), damit importierte und selbst gescrapte Punkte EINE Facette bilden.
 *
 * Muster aus Bundestag Wrapped (`noun_analysis/factions.py`), dort aus Open
 * Discourse übernommen; sie fangen Schreibvarianten und OCR-Fehler älterer
 * Protokolle ab. Die Reihenfolge ist Teil der Logik: der erste Treffer gewinnt.
 */
const FACTION_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  [
    'CDU/CSU',
    /(?:Gast|-)?(?:\s*C\s*[DSMU]\s*S?[DU]\s*(?:\s*[/,':!.-]?)*\s*(?:\s*C+\s*[DSs]?\s*[UÙ]?\s*)?)(?:-?Hosp\.|-Gast|1)?/i,
  ],
  ['SPD', /\s*'?S(?:PD|DP)(?:\.|-Gast)?/i],
  [
    'GRÜNE',
    /(?:BÜNDNIS\s*(?:90)?\/?(?:\s*D[1I]E)?|Bündnis\s*90\/(?:\s*D[1I]E)?)?\s*[GC]R?[UÜ].?\s*[ÑN]EN?(?:\/Bündnis 90)?|BÜNDNISSES?\s*90\/\s*DIE\s*GR?ÜNEN|Grünen/i,
  ],
  ['FDP', /\s*F\.?\s*[PDO][.']?[DP]\.?/i],
  ['AfD', /^AfD$|Alternative für Deutschland/i],
  ['DIE LINKE', /DIE\s*LIN\s?KEN?|LIN\s?KEN|Die Linke/i],
  ['BSW', /^BSW$|Bündnis Sahra Wagenknecht/i],
  ['fraktionslos', /(?:fraktionslos|Parteilos|parteilos)/i],
  ['SSW', /^SSW$/i],
];

export function normalizeParty(raw: string | null | undefined): string | null {
  const party = (raw ?? '').trim();
  if (!party) return null;
  for (const [normalized, pattern] of FACTION_PATTERNS) {
    if (pattern.test(party)) return normalized;
  }
  return null;
}

/**
 * Fraktionen unter den Urhebern einer Drucksache („Fraktion BÜNDNIS 90/DIE
 * GRÜNEN", „Fraktion der CDU/CSU"). Die Bundesregierung, Ausschüsse oder der
 * Bundesrat sind keine Fraktion und fallen heraus.
 */
export function partiesFromUrheber(urheber: readonly string[]): string[] {
  const parties = urheber
    .filter((u) => /^Fraktion\b|^Gruppe\b/i.test(u.trim()))
    .map((u) => normalizeParty(u.replace(/^(?:Fraktion|Gruppe)\s+(?:der\s+)?/i, '')))
    .filter((p): p is string => p !== null);
  return [...new Set(parties)];
}

/**
 * Regierungsmitglieder sprechen als „Name, Bundesminister …:" — ohne Partei in
 * der Zeile. Die Zuordnung stammt aus Bundestag Wrapped (`government.py`) und
 * deckt die Kabinette Merz, Scholz und Merkel (WP 19–21) ab; wer fehlt,
 * bekommt keine Fraktion, die Rede bleibt trotzdem erhalten.
 */
const GOVERNMENT_PARTY: Record<string, string> = {
  // Kabinett Merz (WP 21)
  'Friedrich Merz': 'CDU/CSU',
  'Thorsten Frei': 'CDU/CSU',
  'Christiane Schenderlein': 'CDU/CSU',
  'Wolfram Weimer': 'CDU/CSU',
  'Michael Meister': 'CDU/CSU',
  'Lars Klingbeil': 'SPD',
  'Elisabeth Kaiser': 'SPD',
  'Dennis Rohde': 'SPD',
  'Michael Schrodi': 'SPD',
  'Alexander Dobrindt': 'CDU/CSU',
  'Christoph de Vries': 'CDU/CSU',
  'Daniela Ludwig': 'CDU/CSU',
  'Johann David Wadephul': 'CDU/CSU',
  'Johann Wadephul': 'CDU/CSU',
  'Gunther Krichbaum': 'CDU/CSU',
  'Serap Güler': 'CDU/CSU',
  'Florian Hahn': 'CDU/CSU',
  'Boris Pistorius': 'SPD',
  'Nils Schmid': 'SPD',
  'Sebastian Hartmann': 'SPD',
  'Katherina Reiche': 'CDU/CSU',
  'Gitta Connemann': 'CDU/CSU',
  'Stefan Rouenhoff': 'CDU/CSU',
  'Dorothee Bär': 'CDU/CSU',
  'Matthias Hauer': 'CDU/CSU',
  'Silke Launert': 'CDU/CSU',
  'Stefanie Hubig': 'SPD',
  'Anette Kramme': 'SPD',
  'Frank Schwabe': 'SPD',
  'Karin Prien': 'CDU/CSU',
  'Mareike Wulf': 'CDU/CSU',
  'Mareike Lotte Wulf': 'CDU/CSU',
  'Michael Brand': 'CDU/CSU',
  'Bärbel Bas': 'SPD',
  'Natalie Pawlik': 'SPD',
  'Katja Mast': 'SPD',
  'Kerstin Griese': 'SPD',
  'Karsten Wildberger': 'CDU/CSU',
  'Philipp Amthor': 'CDU/CSU',
  'Thomas Jarzombek': 'CDU/CSU',
  'Patrick Schnieder': 'CDU/CSU',
  'Christian Hirte': 'CDU/CSU',
  'Ulrich Lange': 'CDU/CSU',
  'Carsten Schneider': 'SPD',
  'Carsten Träger': 'SPD',
  'Rita Schwarzelühr-Sutter': 'SPD',
  'Nina Warken': 'CDU/CSU',
  'Georg Kippels': 'CDU/CSU',
  'Tino Sorge': 'CDU/CSU',
  'Alois Rainer': 'CDU/CSU',
  'Silvia Breher': 'CDU/CSU',
  'Martina Englhardt-Kopf': 'CDU/CSU',
  'Reem Alabali-Radovan': 'SPD',
  'Bärbel Kofler': 'SPD',
  'Johann Saathoff': 'SPD',
  'Verena Hubertz': 'SPD',
  'Sören Bartol': 'SPD',
  'Sabine Poschmann': 'SPD',
  // Kabinett Scholz (WP 20)
  'Olaf Scholz': 'SPD',
  'Christian Lindner': 'FDP',
  'Robert Habeck': 'GRÜNE',
  'Annalena Baerbock': 'GRÜNE',
  'Nancy Faeser': 'SPD',
  'Karl Lauterbach': 'SPD',
  'Klara Geywitz': 'SPD',
  'Svenja Schulze': 'SPD',
  'Hubertus Heil': 'SPD',
  'Steffi Lemke': 'GRÜNE',
  'Cem Özdemir': 'GRÜNE',
  'Lisa Paus': 'GRÜNE',
  'Volker Wissing': 'FDP',
  'Marco Buschmann': 'FDP',
  'Bettina Stark-Watzinger': 'FDP',
  // Kabinett Merkel (WP 19)
  'Angela Merkel': 'CDU/CSU',
  'Horst Seehofer': 'CDU/CSU',
  'Jens Spahn': 'CDU/CSU',
  'Peter Altmaier': 'CDU/CSU',
  'Julia Klöckner': 'CDU/CSU',
  'Anja Karliczek': 'CDU/CSU',
  'Andreas Scheuer': 'CDU/CSU',
  'Heiko Maas': 'SPD',
  'Franziska Giffey': 'SPD',
  'Christine Lambrecht': 'SPD',
};

export function partyForOfficial(name: string): string | null {
  const withoutTitle = name.replace(/^(?:(?:Dr|Prof)\.?\s+)+/, '').trim();
  return GOVERNMENT_PARTY[name.trim()] ?? GOVERNMENT_PARTY[withoutTitle] ?? null;
}
