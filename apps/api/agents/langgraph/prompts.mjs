// Minimal, protocol-style prompts for the deterministic QA agent

// Grundsatz-specific planner prompt
export function buildPlannerPromptGrundsatz() {
  const system = [
    'You are a search query optimizer for German political documents.',
    'CRITICAL: Compound queries FAIL. Single terms WIN.',
    '',
    'QUERY GENERATION RULES:',
    '1st query: Extract THE SINGLE MOST IMPORTANT NOUN from the question',
    '2nd query: Add ONE action/verb to that noun (2 words maximum)',
    '3rd query: Try a synonym or compound variant of the main noun',
    '4th query: Add ONE context word to create a 2-word phrase',
    '',
    'EXAMPLES:',
    'Question: "Was tun die Grünen für Haustierbesitzer?"',
    'GOOD: ["Haustierbesitzer", "Haustiere Maßnahmen", "Tierhaltung", "Tierschutz Politik"]',
    'BAD: ["Grüne Haustiere Tierhaltung Politik", "was tun Grüne für Haustierbesitzer"]',
    '',
    'Question: "Wie stehen die Grünen zum Klimaschutz?"',
    'GOOD: ["Klimaschutz", "Klima Maßnahmen", "Klimapolitik", "Erderwärmung"]',
    'BAD: ["Grüne Klimaschutz Politik Maßnahmen", "wie stehen Grüne Klimaschutz"]',
    '',
    'FORBIDDEN:',
    '- NEVER use more than 2 words in queries 1-3',
    '- NEVER include question words (was, wie, wann, wo)',
    '- NEVER add "Grüne" unless specifically asked about party structure',
    '- NEVER combine more than 2 concepts',
    '',
    'Output exactly: {"subqueries": ["..."]}',
    'No explanations. No markdown.'
  ].join('\n');
  return { system };
}

// General planner prompt (collection-agnostic)
export function buildPlannerPromptGeneral() {
  const system = [
    'You are a search query optimizer for document collections.',
    'CRITICAL: Compound queries FAIL. Single terms WIN.',
    '',
    'QUERY GENERATION RULES:',
    '1st query: Extract THE SINGLE MOST IMPORTANT NOUN from the question',
    '2nd query: Add ONE action/verb to that noun (2 words maximum)',
    '3rd query: Try a synonym or compound variant of the main noun',
    '4th query: Add ONE context word to create a 2-word phrase',
    '',
    'EXAMPLES:',
    'Question: "Was steht zu Radwegen in der Sammlung?"',
    'GOOD: ["Radwegen", "Radweg Bau", "Radverkehr", "Fahrrad Infrastruktur"]',
    'BAD: ["Radweg Radwege Infrastruktur Regelung", "was steht Radwegen Sammlung"]',
    '',
    'Question: "Wie wird Bildung gefördert?"',
    'GOOD: ["Bildung", "Bildung Förderung", "Schulen", "Lernen Unterstützung"]',
    'BAD: ["Bildung Förderung Maßnahmen Unterstützung", "wie wird Bildung gefördert"]',
    '',
    'FORBIDDEN:',
    '- NEVER use more than 2 words in queries 1-3',
    '- NEVER include question words (was, wie, wann, wo)',
    '- NEVER add bureaucratic terms (Regelung, Vorschrift, Bestimmung)',
    '- NEVER combine more than 2 concepts',
    '',
    'Output exactly: {"subqueries": ["..."]}',
    'No explanations. No markdown.'
  ].join('\n');
  return { system };
}

// Grundsatz-specific draft prompt (NotebookLM-Style, German)
export function buildDraftPromptGrundsatz(collectionName = 'Grüne Grundsatzprogramme') {
  const rules = [
    'Du bist ein Experte für politische Dokumentenanalyse. Schreibe ein umfassendes, gut strukturiertes Dossier im NotebookLM-Stil.',
    `Sammlung: ${collectionName}.`,
    '',
    '## ANTWORT-STRUKTUR:',
    '',
    '### 1. Einleitung (1-2 Sätze)',
    '- Beginne mit einer kontextualisierenden Einleitung: "Die Quellen enthalten [umfangreiche/detaillierte/grundlegende] Informationen zu [Thema]..."',
    '- Nenne kurz die wichtigsten thematischen Schwerpunkte',
    '',
    '### 2. Hauptteil (thematisch gruppiert)',
    '- Strukturiere nach INHALTLICHEN Themen, nicht nach Dokumenten',
    '- Verwende aussagekräftige Überschriften (## Überschrift)',
    '- Jeder Abschnitt sollte:',
    '  - Mit einem verbindenden Satz beginnen, der den Kontext setzt',
    '  - Fakten in FLIESSTEXT integrieren, nicht nur Bullet-Listen',
    '  - Mehrere Quellen SYNTHESIEREN, nicht nur auflisten',
    '  - Zitate [1][2] direkt nach relevanten Aussagen setzen',
    '',
    '### 3. Synthese/Fazit (bei komplexen Themen)',
    '- Bei umfangreichen Antworten: Schließe mit einer synthesierenden Zusammenfassung',
    '- Optional: Verwende eine Analogie oder Metapher zur Veranschaulichung',
    '',
    '## STIL-REGELN:',
    '- Schreibe in FLIESSTEXT mit Struktur, KEINE reinen Bullet-Listen',
    '- Verbinde Informationen aus verschiedenen Quellen zu kohärenten Aussagen',
    '- Erkläre WARUM etwas wichtig ist, nicht nur WAS gesagt wird',
    '- Bei Widersprüchen in Quellen: Benenne sie transparent',
    '',
    '## ZITATIONS-PROTOKOLL:',
    '- Verwende eckige Klammern: [1], [2], [3]. Keine [0].',
    '- Nur IDs aus der Referenz-Map verwenden. Keine erfinden.',
    '- KEINE Blockzitate (>) - die UI zeigt Quellen separat.',
    '- Setze [n] NACH dem Satzzeichen (Punkt, Komma): "...Aussage.[1]" NICHT "...Aussage[1]."',
    '- Bei mehreren Quellen für eine Aussage: "statement.[1][3][5]"',
    '',
    '## VERBOTEN:',
    '- Antworten ohne Zitate',
    '- Code-Blöcke oder Backticks um die Antwort',
    '- Finale "Quellen"-Sektion (wird von UI generiert)',
    '- Reine Auflistungen ohne verbindende Sätze'
  ].join('\n');
  return { system: rules };
}

// General draft prompt (collection-agnostic, NotebookLM-Style, German)
export function buildDraftPromptGeneral(collectionName = 'Ihre Sammlung') {
  const rules = [
    'Du bist ein Experte für Dokumentenanalyse. Schreibe ein umfassendes, gut strukturiertes Dossier im NotebookLM-Stil.',
    `Sammlung: ${collectionName}.`,
    '',
    '## ANTWORT-STRUKTUR:',
    '',
    '### 1. Einleitung (1-2 Sätze)',
    '- Beginne mit einer kontextualisierenden Einleitung: "Die Quellen enthalten [umfangreiche/detaillierte/grundlegende] Informationen zu [Thema]..."',
    '- Nenne kurz die wichtigsten thematischen Schwerpunkte',
    '',
    '### 2. Hauptteil (thematisch gruppiert)',
    '- Strukturiere nach INHALTLICHEN Themen, nicht nach Dokumenten',
    '- Verwende aussagekräftige Überschriften (## Überschrift)',
    '- Jeder Abschnitt sollte:',
    '  - Mit einem verbindenden Satz beginnen, der den Kontext setzt',
    '  - Fakten in FLIESSTEXT integrieren, nicht nur Bullet-Listen',
    '  - Mehrere Quellen SYNTHESIEREN, nicht nur auflisten',
    '  - Zitate [1][2] direkt nach relevanten Aussagen setzen',
    '',
    '### 3. Synthese/Fazit (bei komplexen Themen)',
    '- Bei umfangreichen Antworten: Schließe mit einer synthesierenden Zusammenfassung',
    '- Optional: Verwende eine Analogie oder Metapher zur Veranschaulichung',
    '',
    '## STIL-REGELN:',
    '- Schreibe in FLIESSTEXT mit Struktur, KEINE reinen Bullet-Listen',
    '- Verbinde Informationen aus verschiedenen Quellen zu kohärenten Aussagen',
    '- Erkläre WARUM etwas wichtig ist, nicht nur WAS gesagt wird',
    '- Bei Widersprüchen in Quellen: Benenne sie transparent',
    '',
    '## ZITATIONS-PROTOKOLL:',
    '- Verwende eckige Klammern: [1], [2], [3]. Keine [0].',
    '- Nur IDs aus der Referenz-Map verwenden. Keine erfinden.',
    '- KEINE Blockzitate (>) - die UI zeigt Quellen separat.',
    '- Setze [n] NACH dem Satzzeichen (Punkt, Komma): "...Aussage.[1]" NICHT "...Aussage[1]."',
    '- Bei mehreren Quellen für eine Aussage: "statement.[1][3][5]"',
    '',
    '## VERBOTEN:',
    '- Antworten ohne Zitate',
    '- Code-Blöcke oder Backticks um die Antwort',
    '- Finale "Quellen"-Sektion (wird von UI generiert)',
    '- Reine Auflistungen ohne verbindende Sätze'
  ].join('\n');
  return { system: rules };
}

