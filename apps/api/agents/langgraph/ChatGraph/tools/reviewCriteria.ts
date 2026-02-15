/**
 * Per-Agent Review Criteria
 *
 * Quality checklists used by the self_review tool. Each agent type
 * has domain-specific criteria extracted from its systemRole.
 */

export interface ReviewCriterion {
  id: string;
  label: string;
  weight: number; // 1-3, higher = more important
}

const ANTRAG_CRITERIA: ReviewCriterion[] = [
  { id: 'betreff', label: 'Enthält einen klaren, prägnanten Betreff', weight: 2 },
  { id: 'beschluss', label: 'Hat einen konkreten Beschlussvorschlag ("Die Verwaltung wird beauftragt...")', weight: 3 },
  { id: 'begruendung', label: 'Begründung enthält Fakten, Ist-Zustand und Soll-Zustand', weight: 3 },
  { id: 'sprache', label: 'Sprache ist formal, rechtssicher und geschlechtsneutral', weight: 2 },
  { id: 'laenge', label: 'Angemessene Länge (ca. 1500-2000 Zeichen für Anträge)', weight: 1 },
  { id: 'struktur', label: 'Klare Struktur mit erkennbaren Abschnitten', weight: 2 },
  { id: 'finanzen', label: 'Finanzielle Auswirkungen werden angesprochen', weight: 1 },
];

const REDE_CRITERIA: ReviewCriterion[] = [
  { id: 'einstieg', label: 'Starker, aufmerksamkeitsfesselnder Einstieg', weight: 3 },
  { id: 'kernargumente', label: '2-3 klare Kernargumente mit Belegen', weight: 3 },
  { id: 'rhetorik', label: 'Rhetorische Mittel (Wiederholungen, Metaphern, rhetorische Fragen)', weight: 2 },
  { id: 'appell', label: 'Kraftvoller Aufruf zum Handeln am Ende', weight: 3 },
  { id: 'balance', label: 'Balance zwischen Leidenschaft und Professionalität', weight: 2 },
  { id: 'uebergaenge', label: 'Gute Übergänge zwischen Abschnitten', weight: 1 },
  { id: 'hinweise', label: 'Einstiegsideen, Kernargumente und Tipps für Redner*in vorangestellt', weight: 2 },
];

const WAHLPROGRAMM_CRITERIA: ReviewCriterion[] = [
  { id: 'einleitung', label: 'Kurze Einleitung zur Bedeutung des Themas', weight: 2 },
  { id: 'unterkapitel', label: '3-4 Unterkapitel mit aussagekräftigen Überschriften', weight: 3 },
  { id: 'forderungen', label: 'Konkrete politische Forderungen und Lösungsvorschläge', weight: 3 },
  { id: 'sprache', label: 'Klare, direkte Sprache ohne Fachbegriffe, Wir-Form', weight: 2 },
  { id: 'zukunft', label: 'Zukunftsorientiert und inklusiv formuliert', weight: 2 },
  { id: 'loesungen', label: 'Kritisiert Missstände, bleibt aber lösungsorientiert', weight: 2 },
  { id: 'beispiele', label: 'Enthält konkrete Beispiele und starke Verben', weight: 1 },
];

const OEFF_CRITERIA: ReviewCriterion[] = [
  { id: 'format', label: 'Korrektes Format für die angefragte Plattform', weight: 3 },
  { id: 'ton', label: 'Plattform-gerechter Ton (sachlich für PM, locker für Social Media)', weight: 3 },
  { id: 'cta', label: 'Klarer Call-to-Action vorhanden', weight: 2 },
  { id: 'laenge', label: 'Zeichenlimit der Plattform eingehalten', weight: 2 },
  { id: 'fakten', label: 'Keine erfundenen Fakten oder Zitate', weight: 3 },
  { id: 'w_fragen', label: 'Lead-Absatz bei PM beantwortet W-Fragen', weight: 2 },
];

const GRUENE_JUGEND_CRITERIA: ReviewCriterion[] = [
  { id: 'ton', label: 'Authentischer, jugendlicher und aktivistischer Ton', weight: 3 },
  { id: 'positionierung', label: 'Klare linke politische Positionierung', weight: 3 },
  { id: 'cta', label: 'Starke Handlungsaufforderung und Aktivismus-Aufruf', weight: 2 },
  { id: 'plattform', label: 'Plattform-spezifische Formatierung eingehalten', weight: 2 },
  { id: 'inklusion', label: 'Solidarische Botschaften mit marginalisierten Gruppen', weight: 2 },
  { id: 'interaktion', label: 'Fragen zur Interaktion gestellt', weight: 1 },
];

const CRITERIA_MAP: Record<string, ReviewCriterion[]> = {
  'gruenerator-antrag': ANTRAG_CRITERIA,
  'gruenerator-rede-schreiber': REDE_CRITERIA,
  'gruenerator-wahlprogramm': WAHLPROGRAMM_CRITERIA,
  'gruenerator-oeffentlichkeitsarbeit': OEFF_CRITERIA,
  'gruenerator-gruene-jugend': GRUENE_JUGEND_CRITERIA,
};

/**
 * Get review criteria for a given agent identifier.
 * Returns undefined for agents without review criteria (Tier 1 only).
 */
export function getReviewCriteria(agentIdentifier: string): ReviewCriterion[] | undefined {
  return CRITERIA_MAP[agentIdentifier];
}

/**
 * Format criteria into a prompt-friendly checklist string.
 */
export function formatCriteriaForPrompt(criteria: ReviewCriterion[]): string {
  return criteria
    .sort((a, b) => b.weight - a.weight)
    .map((c) => `- [Gewicht ${c.weight}] ${c.label}`)
    .join('\n');
}
