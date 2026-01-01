/**
 * Predefined Question Bank for Interactive Antrag Generator
 *
 * Questions are organized by request type and round.
 * Each question has:
 * - id: unique identifier
 * - text: question text shown to user
 * - type: category (scope, audience, tone, structure, facts)
 * - options: array of predefined answers (for multiple choice)
 * - requiresText: boolean, if true user must provide text answer
 */

/**
 * V2 Questions - New 6-question structure (hybrid static + AI)
 * Used as fallback when AI generation fails
 */
const ANTRAG_QUESTIONS_V2 = {
  antrag: {
    round1: [
      {
        id: 'q1_action_type',
        text: 'Handlung oder Prüfung? (Der Kern des Beschlusses)',
        type: 'action_type',
        questionFormat: 'yes_no',
        options: [
          'Handlungsantrag (direkte Umsetzung)',
          'Prüfantrag (Machbarkeit klären)'
        ],
        optionEmojis: ['🚀', '🔍'],
        allowCustom: false,
        allowMultiSelect: false
      },
      {
        id: 'q2_pain_point',
        text: 'Was ist das exakte Problem (\'Pain Point\')?',
        type: 'pain_point',
        questionFormat: 'multiple_choice',
        options: [
          'Aktuelle Situation ist unzureichend',
          'Dringender Handlungsbedarf besteht',
          'Verbesserungspotenzial vorhanden'
        ],
        optionEmojis: ['⚠️', '🚨', '📈'],
        allowCustom: true,
        allowMultiSelect: false,
        placeholder: 'Eigenes Problem beschreiben...'
      },
      {
        id: 'q3_beneficiaries',
        text: 'Wer profitiert davon? (Der Nutzen)',
        type: 'beneficiaries',
        questionFormat: 'multiple_choice',
        options: [
          'Alle Bürger*innen',
          'Spezifische Bevölkerungsgruppen',
          'Übergeordnete Ziele (Klimaschutz, Verkehrssicherheit)'
        ],
        optionEmojis: ['👥', '👨‍👩‍👧‍👦', '🌍'],
        allowCustom: true,
        allowMultiSelect: true,
        placeholder: 'Weitere Nutznießer...'
      },
      {
        id: 'q4_budget',
        text: 'Gibt es finanzielle Vorstellungen?',
        type: 'budget',
        questionFormat: 'multiple_choice',
        options: [
          'Ja, konkrete Kostenschätzung vorhanden',
          'Ja, Deckungsvorschlag soll genannt werden',
          'Verwaltung soll Kosten im Rahmen der Prüfung ermitteln',
          'Überspringen'
        ],
        optionEmojis: ['💶', '💰', '🔍', '⏭️'],
        allowCustom: false,
        allowMultiSelect: false,
        skipOption: 'Überspringen'
      },
      {
        id: 'q5_history',
        text: 'Gibt es eine Vorgeschichte?',
        type: 'history',
        questionFormat: 'multiple_choice',
        options: [
          'Keine bekannte Vorgeschichte',
          'Thema wurde bereits diskutiert',
          'Reaktion auf Bürgeranfragen',
          'Anknüpfung an bestehendes Programm'
        ],
        optionEmojis: ['❌', '💬', '👥', '🔄'],
        allowCustom: true,
        allowMultiSelect: false,
        placeholder: 'Eigene Vorgeschichte angeben...'
      },
      {
        id: 'q6_urgency',
        text: 'Wie hoch ist die Dringlichkeit?',
        type: 'urgency',
        questionFormat: 'multiple_choice',
        options: [
          'Sofort / Eilantrag',
          'In den nächsten 3 Monaten',
          'In den nächsten 6 Monaten',
          'Bis zum Jahresende',
          'Langfristig (über 1 Jahr)'
        ],
        optionEmojis: ['⚡', '📅', '📆', '🗓️', '🕐'],
        allowCustom: true,
        allowMultiSelect: false,
        placeholder: 'z.B. \'Vor Beginn der Sommerferien\', \'Vor Haushaltsverabschiedung\'...'
      }
    ]
  },
  kleine_anfrage: {
    round1: [
      {
        id: 'q1_action_type',
        text: 'Handlung oder Prüfung? (Der Kern des Beschlusses)',
        type: 'action_type',
        questionFormat: 'yes_no',
        options: [
          'Handlungsantrag (direkte Umsetzung)',
          'Prüfantrag (Machbarkeit klären)'
        ],
        optionEmojis: ['🚀', '🔍'],
        allowCustom: false,
        allowMultiSelect: false
      },
      {
        id: 'q2_pain_point',
        text: 'Was ist das exakte Problem (\'Pain Point\')?',
        type: 'pain_point',
        questionFormat: 'multiple_choice',
        options: [
          'Fehlende Informationen und Transparenz',
          'Unklare Zuständigkeiten oder Prozesse',
          'Kritische Entwicklung beobachtet'
        ],
        optionEmojis: ['❓', '🔄', '📊'],
        allowCustom: true,
        allowMultiSelect: false,
        placeholder: 'Eigenes Problem beschreiben...'
      },
      {
        id: 'q3_beneficiaries',
        text: 'Wer profitiert davon? (Der Nutzen)',
        type: 'beneficiaries',
        questionFormat: 'multiple_choice',
        options: [
          'Transparenz für alle Bürger*innen',
          'Grundlage für weitere politische Arbeit',
          'Aufklärung von Missständen'
        ],
        optionEmojis: ['👥', '📋', '🔍'],
        allowCustom: true,
        allowMultiSelect: true,
        placeholder: 'Weitere Nutznießer...'
      },
      {
        id: 'q4_budget',
        text: 'Gibt es finanzielle Vorstellungen?',
        type: 'budget',
        questionFormat: 'multiple_choice',
        options: [
          'Ja, konkrete Kostenschätzung vorhanden',
          'Ja, Deckungsvorschlag soll genannt werden',
          'Verwaltung soll Kosten im Rahmen der Prüfung ermitteln',
          'Überspringen'
        ],
        optionEmojis: ['💶', '💰', '🔍', '⏭️'],
        allowCustom: false,
        allowMultiSelect: false,
        skipOption: 'Überspringen'
      },
      {
        id: 'q5_history',
        text: 'Gibt es eine Vorgeschichte?',
        type: 'history',
        questionFormat: 'multiple_choice',
        options: [
          'Keine bekannte Vorgeschichte',
          'Frühere Anfrage zu diesem Thema',
          'Reaktion auf Medienberichte',
          'Bürgeranfragen oder -beschwerden'
        ],
        optionEmojis: ['❌', '📋', '📰', '👥'],
        allowCustom: true,
        allowMultiSelect: false,
        placeholder: 'Eigene Vorgeschichte angeben...'
      },
      {
        id: 'q6_urgency',
        text: 'Wie hoch ist die Dringlichkeit?',
        type: 'urgency',
        questionFormat: 'multiple_choice',
        options: [
          'Sofort / Eilantrag',
          'In den nächsten 3 Monaten',
          'In den nächsten 6 Monaten',
          'Bis zum Jahresende',
          'Langfristig (über 1 Jahr)'
        ],
        optionEmojis: ['⚡', '📅', '📆', '🗓️', '🕐'],
        allowCustom: true,
        allowMultiSelect: false,
        placeholder: 'z.B. \'Vor Beginn der Sommerferien\', \'Vor Haushaltsverabschiedung\'...'
      }
    ]
  },
  grosse_anfrage: {
    round1: [
      {
        id: 'q1_action_type',
        text: 'Handlung oder Prüfung? (Der Kern des Beschlusses)',
        type: 'action_type',
        questionFormat: 'yes_no',
        options: [
          'Handlungsantrag (direkte Umsetzung)',
          'Prüfantrag (Machbarkeit klären)'
        ],
        optionEmojis: ['🚀', '🔍'],
        allowCustom: false,
        allowMultiSelect: false
      },
      {
        id: 'q2_pain_point',
        text: 'Was ist das exakte Problem (\'Pain Point\')?',
        type: 'pain_point',
        questionFormat: 'multiple_choice',
        options: [
          'Grundsätzliche strategische Defizite',
          'Mangelnde politische Aufmerksamkeit',
          'Komplexe Problemlage erfordert umfassende Debatte'
        ],
        optionEmojis: ['📉', '🎯', '💬'],
        allowCustom: true,
        allowMultiSelect: false,
        placeholder: 'Eigenes Problem beschreiben...'
      },
      {
        id: 'q3_beneficiaries',
        text: 'Wer profitiert davon? (Der Nutzen)',
        type: 'beneficiaries',
        questionFormat: 'multiple_choice',
        options: [
          'Gesamte Stadtgesellschaft',
          'Langfristige strategische Entwicklung',
          'Politische Meinungsbildung'
        ],
        optionEmojis: ['🏙️', '🎯', '💬'],
        allowCustom: true,
        allowMultiSelect: true,
        placeholder: 'Weitere Nutznießer...'
      },
      {
        id: 'q4_budget',
        text: 'Gibt es finanzielle Vorstellungen?',
        type: 'budget',
        questionFormat: 'multiple_choice',
        options: [
          'Ja, konkrete Kostenschätzung vorhanden',
          'Ja, Deckungsvorschlag soll genannt werden',
          'Verwaltung soll Kosten im Rahmen der Prüfung ermitteln',
          'Überspringen'
        ],
        optionEmojis: ['💶', '💰', '🔍', '⏭️'],
        allowCustom: false,
        allowMultiSelect: false,
        skipOption: 'Überspringen'
      },
      {
        id: 'q5_history',
        text: 'Gibt es eine Vorgeschichte?',
        type: 'history',
        questionFormat: 'multiple_choice',
        options: [
          'Keine bekannte Vorgeschichte',
          'Langjährige politische Debatte',
          'Reaktion auf gesellschaftliche Entwicklungen',
          'Aufgriff von überregionalen Themen'
        ],
        optionEmojis: ['❌', '📋', '🌍', '📰'],
        allowCustom: true,
        allowMultiSelect: false,
        placeholder: 'Eigene Vorgeschichte angeben...'
      },
      {
        id: 'q6_urgency',
        text: 'Wie hoch ist die Dringlichkeit?',
        type: 'urgency',
        questionFormat: 'multiple_choice',
        options: [
          'Sofort / Eilantrag',
          'In den nächsten 3 Monaten',
          'In den nächsten 6 Monaten',
          'Bis zum Jahresende',
          'Langfristig (über 1 Jahr)'
        ],
        optionEmojis: ['⚡', '📅', '📆', '🗓️', '🕐'],
        allowCustom: true,
        allowMultiSelect: false,
        placeholder: 'z.B. \'Vor Beginn der Sommerferien\', \'Vor Haushaltsverabschiedung\'...'
      }
    ]
  }
};

/**
 * V1 Questions - Original question structure (kept for backwards compatibility)
 */
const ANTRAG_QUESTIONS = {
  /**
   * Questions for standard Antrag (motion)
   */
  antrag: {
    round1: [
      {
        id: 'q1_scope',
        text: 'Welche spezifischen Aspekte sollen im Vordergrund stehen?',
        type: 'scope',
        options: [
          'Alle genannten Aspekte gleichwertig behandeln',
          'Schwerpunkt auf konkrete Umsetzung und Maßnahmen'
        ],
        allowCustom: true,
        placeholder: 'z.B. Klimaschutz, Mobilität, Soziales...'
      },
      {
        id: 'q2_audience',
        text: 'An welches Gremium richtet sich der Antrag?',
        type: 'audience',
        options: [
          'Gemeinderat',
          'Stadtrat'
        ],
        allowCustom: true,
        placeholder: 'z.B. Kreistag, Ausschuss, Fraktion...'
      },
      {
        id: 'q3_tone',
        text: 'Welche Tonalität bevorzugst du?',
        type: 'tone',
        options: [
          'Sachlich-neutral',
          'Appellativ und motivierend'
        ],
        allowCustom: true,
        placeholder: 'z.B. Fachlich-detailliert, Politisch-programmatisch...'
      },
      {
        id: 'q4_structure',
        text: 'Gibt es besondere Wünsche zur Struktur oder Gliederung?',
        type: 'structure',
        options: [
          'Standardgliederung mit Begründung und Antragsteil',
          'Schwerpunkt auf ausführliche Begründung mit Fakten'
        ],
        allowCustom: true,
        placeholder: 'z.B. bestimmte Abschnitte, Schwerpunkte...'
      }
    ],
    round2: [
      {
        id: 'f1_priority',
        text: 'Welcher Aspekt soll als erstes und am ausführlichsten behandelt werden?',
        type: 'clarification',
        refersTo: 'q1_scope',
        options: [
          'Der erste genannte Aspekt soll Priorität haben',
          'Alle Aspekte gleichwertig, chronologisch aufbauen'
        ],
        allowCustom: true,
        placeholder: 'z.B. Klimaschutz zuerst, dann Mobilität...'
      }
    ]
  },

  /**
   * Questions for Kleine Anfrage (minor interpellation)
   */
  kleine_anfrage: {
    round1: [
      {
        id: 'q1_info_goal',
        text: 'Welche konkreten Informationen oder Daten möchtest du erfragen?',
        type: 'facts',
        options: [
          'Statistische Daten und Zahlen zum Thema',
          'Planungen und Zeitrahmen für Umsetzung'
        ],
        allowCustom: true,
        placeholder: 'z.B. Budgets, Beschlüsse, Entwicklungen...'
      },
      {
        id: 'q2_background',
        text: 'Warum sind diese Informationen wichtig? Was ist der Hintergrund?',
        type: 'scope',
        options: [
          'Aktuelle Entwicklung oder Ereignis',
          'Bürgeranfragen oder öffentliches Interesse'
        ],
        allowCustom: true,
        placeholder: 'z.B. Zeitungsartikel, Beschwerden, Beobachtungen...'
      },
      {
        id: 'q3_audience',
        text: 'An wen richtet sich die Anfrage?',
        type: 'audience',
        options: [
          'Bürgermeister:in',
          'Verwaltung allgemein'
        ],
        allowCustom: true,
        placeholder: 'z.B. Bestimmtes Dezernat, Ausschuss...'
      },
      {
        id: 'q4_format',
        text: 'Bevorzugst du eine bestimmte Antwortform?',
        type: 'structure',
        options: [
          'Tabellarische Übersicht',
          'Ausführliche Erläuterung'
        ],
        allowCustom: true,
        placeholder: 'z.B. Zahlen und Statistiken, Keine Präferenz...'
      }
    ],
    round2: [
      {
        id: 'f1_specificity',
        text: 'Sollen die Fragen noch spezifischer formuliert werden (z.B. Zeitraum, Stadtteile)?',
        type: 'clarification',
        refersTo: 'q1_info_goal',
        options: [
          'Ja, bitte so spezifisch wie möglich formulieren',
          'Nein, allgemeine Formulierung ist ausreichend'
        ],
        allowCustom: true,
        placeholder: 'z.B. Nur für bestimmten Zeitraum, Nur für bestimmte Stadtteile...'
      }
    ]
  },

  /**
   * Questions for Große Anfrage (major interpellation)
   */
  grosse_anfrage: {
    round1: [
      {
        id: 'q1_main_topic',
        text: 'Welche politischen Hauptthemen sollen umfassend beleuchtet werden?',
        type: 'scope',
        options: [
          'Gesamtstrategie zu einem übergreifenden Thema',
          'Mehrere zusammenhängende Themenbereiche'
        ],
        allowCustom: true,
        placeholder: 'z.B. Spezifische Politikfelder, Querschnittsthemen...'
      },
      {
        id: 'q2_debate_focus',
        text: 'Was soll im Zentrum der angestrebten Ratsdebatte stehen?',
        type: 'scope',
        options: [
          'Kritische Analyse bestehender Missstände',
          'Chancen und Zukunftsvisionen entwickeln'
        ],
        allowCustom: true,
        placeholder: 'z.B. Konkrete Lösungsvorschläge, Politische Forderungen...'
      },
      {
        id: 'q3_tone',
        text: 'Welcher Stil ist für die öffentliche Debatte gewünscht?',
        type: 'tone',
        options: [
          'Konstruktiv-lösungsorientiert',
          'Kritisch-analytisch'
        ],
        allowCustom: true,
        placeholder: 'z.B. Visionär-zukunftsorientiert, Fordernd-appellativ...'
      },
      {
        id: 'q4_data_focus',
        text: 'Welche Art von Daten und Fakten sollen besonders hervorgehoben werden?',
        type: 'facts',
        options: [
          'Vergleichszahlen und Entwicklungen über Zeit',
          'Kosten und finanzielle Auswirkungen'
        ],
        allowCustom: true,
        placeholder: 'z.B. Benchmarks mit anderen Städten, Prognosen...'
      }
    ],
    round2: [
      {
        id: 'f1_sub_questions',
        text: 'Sollen bestimmte Unterthemen mit eigenen Fragenkomplexen behandelt werden?',
        type: 'clarification',
        refersTo: 'q1_main_topic',
        options: [
          'Ja, Unterthemen mit jeweils eigenen Fragen gliedern',
          'Nein, übergreifende Fragen ohne Untergliederung'
        ],
        allowCustom: true,
        placeholder: 'z.B. Spezifische Unterthemen die besonders wichtig sind...'
      },
      {
        id: 'f2_political_context',
        text: 'Gibt es aktuelle politische Anlässe die eingebunden werden sollen?',
        type: 'clarification',
        options: [
          'Ja, es gibt konkrete aktuelle Anlässe',
          'Nein, allgemeine strategische Anfrage'
        ],
        allowCustom: true,
        placeholder: 'z.B. Beschlüsse, Ereignisse, Medienberichte...'
      }
    ]
  }
};

/**
 * Get questions for a specific request type and round
 * @param {string} requestType - 'antrag' | 'kleine_anfrage' | 'grosse_anfrage'
 * @param {number} round - 1 or 2
 * @param {number} version - 1 (legacy) or 2 (new 7-question hybrid)
 * @returns {array} Array of question objects
 */
function getQuestionsForType(requestType, round = 1, version = 2) {
  const roundKey = `round${round}`;
  const questionSet = version === 2 ? ANTRAG_QUESTIONS_V2 : ANTRAG_QUESTIONS;

  // Validate request type
  if (!questionSet[requestType]) {
    console.warn(`[AntragQuestions] Unknown request type: ${requestType}, using 'antrag' as fallback`);
    return questionSet.antrag[roundKey] || [];
  }

  // Get questions for this type and round
  const questions = questionSet[requestType][roundKey];

  if (!questions) {
    console.warn(`[AntragQuestions] No questions defined for ${requestType} round ${round} version ${version}`);
    // Fallback to v2 if v1 fails, or vice versa
    const fallbackSet = version === 2 ? ANTRAG_QUESTIONS : ANTRAG_QUESTIONS_V2;
    return fallbackSet[requestType]?.[roundKey] || [];
  }

  return questions;
}

/**
 * Check if a request type has follow-up questions defined
 * @param {string} requestType - Request type to check
 * @returns {boolean} True if round2 questions exist
 */
function hasFollowUpQuestions(requestType) {
  return !!(ANTRAG_QUESTIONS[requestType]?.round2?.length > 0);
}

/**
 * Get all available question types
 * @returns {array} Array of request types
 */
function getAvailableRequestTypes() {
  return Object.keys(ANTRAG_QUESTIONS);
}

export { ANTRAG_QUESTIONS, ANTRAG_QUESTIONS_V2, getQuestionsForType, hasFollowUpQuestions, getAvailableRequestTypes };