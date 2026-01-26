/**
 * Type-specific defaults for AI prompts and sampling parameters
 * Used by AI workers to configure model behavior based on content type
 */

export interface TypeProfile {
  system?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export type ProfileType =
  | 'presse'
  | 'social'
  | 'rede'
  | 'wahlprogramm'
  | 'text_adjustment'
  | 'antrag'
  | 'generator_config'
  | 'gruenerator_ask'
  | 'alttext'
  | 'search_enhancement'
  | 'web_search_summary'
  | 'leichte_sprache';

const profiles: Record<ProfileType, TypeProfile> = {
  presse: {
    system: 'Du bist ein erfahrener Pressesprecher...',
    temperature: 0.4,
  },
  social: {
    system: 'Du bist ein Social Media Manager...',
    temperature: 0.6,
  },
  rede: {
    system: 'Du bist ein Redenschreiber...',
    temperature: 0.3,
  },
  wahlprogramm: {
    system: 'Du bist ein Experte für Wahlprogramme...',
    temperature: 0.2,
  },
  text_adjustment: {
    system: 'Du bist ein Experte für Textoptimierung...',
    temperature: 0.3,
  },
  antrag: {
    system: 'Du bist ein erfahrener Kommunalpolitiker von Bündnis 90/Die Grünen...',
    temperature: 0.3,
  },
  generator_config: {
    temperature: 0.5,
  },
  gruenerator_ask: {
    system:
      'Du bist ein hilfsreicher Assistent, der Fragen zu hochgeladenen Dokumenten beantwortet. Analysiere die bereitgestellten Dokumente und beantworte die Nutzerfrage präzise und hilfreich auf Deutsch.',
    model: 'claude-3-5-haiku-latest',
    temperature: 0.3,
  },
  alttext: {
    system:
      'Du erstellst Alternativtexte (Alt-Text) für Bilder basierend auf den DBSV-Richtlinien für Barrierefreiheit.',
    model: 'claude-3-5-sonnet-latest',
    temperature: 0.3,
    max_tokens: 2000,
  },
  search_enhancement: {
    system:
      'Du bist ein intelligenter Suchagent für deutsche politische und kommunale Inhalte. Du kannst Suchanfragen erweitern oder autonome Datenbanksuchen durchführen. Nutze verfügbare Tools für komplexe Suchen oder antworte mit JSON für einfache Abfragen.',
    model: 'claude-3-5-haiku-latest',
    temperature: 0.2,
    max_tokens: 2000,
  },
  web_search_summary: {
    system:
      'Du bist ein Experte für die Zusammenfassung von Websuche-Ergebnissen. Erstelle KURZE (max. 800 Zeichen), präzise Zusammenfassungen auf Deutsch. WICHTIG: Verwende NUR [1], [2], [3] Zitationen - NIEMALS "Quelle:" Format. Fokussiere auf die wichtigsten 2-3 Kernaussagen mit Quellenbelegen.',
    model: 'claude-3-5-haiku-latest',
    temperature: 0.2,
    max_tokens: 400,
  },
  leichte_sprache: {
    system:
      'Du bist ein Experte für Leichte Sprache. Übersetze Texte in Leichte Sprache nach den Regeln des Netzwerk Leichte Sprache e.V.',
    temperature: 0.3,
  },
};

/**
 * Get type-specific profile configuration
 */
export function getTypeProfile(type: string): TypeProfile | null {
  return profiles[type as ProfileType] || null;
}

/**
 * Get all type profiles
 */
export function getAllTypeProfiles(): Record<ProfileType, TypeProfile> {
  return { ...profiles };
}
