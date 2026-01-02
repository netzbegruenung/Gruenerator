import type { PlatformGuideline, SearchDocumentsTool } from './types.js';

export const HTML_FORMATTING_INSTRUCTIONS = `
**Formatierung:** Bitte formatiere die GESAMTE Ausgabe als HTML.
- Verwende <h2>-Tags für die Hauptüberschriften (z.B. "Einstiegsideen", "Kernargumente", "Tipps", "Rede").
- Verwende <h3>-Tags für Unterüberschriften und <h4>-Tags für weitere Unterteilungen.
- Verwende <p>-Tags für **jeden einzelnen** Textabsatz unterhalb der Überschriften und innerhalb der Rede. Jeder Gedanke oder logische Block, der einen Absatz darstellt, muss in eigenen <p>...</p>-Tags stehen. Verwende **keine** <br>-Tags, um Absätze zu simulieren.
- Verwende <strong> für wichtige Stichworte *innerhalb* von Absätzen, falls nötig.
- Stelle sicher, dass nach einem Doppelpunkt (z.B. nach einer <h2>-Überschrift) immer ein Leerzeichen folgt, bevor der nächste Text oder eine Liste beginnt.
- Verwende <ul> und <li> für Listenpunkte bei den Ideen und Tipps.
- Füge **keine** zusätzlichen Zeilenumbrüche (newline characters wie '\\\\n') in den HTML-Code ein, weder innerhalb noch zwischen den Tags. Der einzige Inhalt zwischen </p> und <p> oder zwischen </h2> und <p> sollte Leerraum (whitespace) sein, keine Zeilenumbrüche.
- KEINEN Markdown verwenden.
`;

export const PLATFORM_SPECIFIC_GUIDELINES: Record<string, PlatformGuideline> = {
  facebook: {
    maxLength: 600,
    style: "Casual and conversational. Use emojis sparingly.",
    focus: "Community engagement, longer-form content, visual storytelling.",
    additionalGuidelines: `
      - Use a personal, direct tone ("you").
      - Friendly and relaxed style encouraging discussions.
      - Include visual elements to support the text.
      - Use emojis and hashtags sparingly.
      - End the post with a clear call to action.
    `
  },
  instagram: {
    maxLength: 600,
    style: "Visual, fun, and snappy.",
    focus: "Visual appeal, lifestyle content, behind-the-scenes glimpses.",
    additionalGuidelines: `
      - Use a few emojis to visually emphasize emotions and messages, at the beginning or end of a sentence for accessibility.
      - Keep paragraphs short and scannable.
      - Share clear, engaging political messages that resonate emotionally.
      - Use hashtags strategically to increase reach.
      - End the post with a call to action or a question if useful.
    `
  },
  twitter: {
    maxLength: 280,
    style: "Concise and witty. Use hashtags strategically.",
    focus: "Real-time updates, quick facts, calls-to-action.",
    additionalGuidelines: `
      - Use clear, direct language with no unnecessary elaboration.
      - Present clear political positions on current issues.
      - Use a direct tone to engage the reader.
      - Use hashtags strategically but avoid overuse .
      - Sparing use of emojis.
      - Start with a hook or clear statement.
      - End the post with a call to action or a question.
    `
  },
  linkedin: {
    maxLength: 600,
    style: "Professional yet approachable. Minimal use of emojis.",
    focus: "policy discussions, professional development.",
    additionalGuidelines: `
      - Maintain a professional but approachable tone.
      - Share insights and analyses on current topics or trends.
      - Highlight the connection between politics and professional growth.
      - Use emojis sparingly and limit excessive hashtag use.
      - End the post with a call to action or a question geared towards professional engagement.
    `
  },
  reelScript: {
    maxLength: 1000,
    style: "Einfach, authentisch und direkt",
    focus: "Klare Botschaft mit minimalen technischen Anforderungen.",
    additionalGuidelines: `
      - Skript für 90 Sekunden Sprechzeit
      - Maximal 2-3 einfache Schnitte/Szenen
      - [Szenenanweisungen] sollten mit Smartphone und ohne spezielle Ausrüstung umsetzbar sein
      - Struktur:
        * Einstieg/Hook (20s): Eine Szene, direkt in die Kamera sprechen
        * Hauptteil (50s): Optional 1-2 einfache Einblendungen von Bilderm, Videos, Fakten oder Zahlen
        * Abschluss (20s): Wieder direkt in die Kamera, Call-to-Action
      - Natürliche, authentische Sprache wie in einem persönlichen Gespräch
      - Text sollte auch ohne visuelle Elemente funktionieren
      - Einblendungen nur für wichtige Zahlen oder Kernbotschaften verwenden
    `
  },
  actionIdeas: {
    maxLength: 1000,
    style: "Konkret und umsetzbar",
    focus: "Praktische Aktionen für Ortsverbände",
    additionalGuidelines: `
      - 2-3 konkrete Aktionsideen
      - Mit wenig Budget umsetzbar
      - Aufmerksamkeit erregen
      - Zum Mitmachen einladen
      - Die grüne Botschaft transportieren
      - Klare Handlungsanweisungen
      - Materialanforderungen auflisten
      - Zeitaufwand einschätzen
    `
  }
};

export const MARKDOWN_FORMATTING_INSTRUCTIONS = `
**Formatierung:**
Nutze Markdown: **fett**, - Listen. Kein HTML.
Überschriften sparsam einsetzen: ## nur für Hauptabschnitte, ### nur wenn wirklich nötig für Unterabschnitte.
Keine Überschriften mitten im Fließtext - nutze sie nur für klar abgegrenzte Abschnitte am Anfang eines neuen Themenblocks.
`;

export const COMPREHENSIVE_DOSSIER_INSTRUCTIONS = `
Du bist ein politischer Analyst mit direktem Zugang zu den offiziellen Grundsatzprogrammen der Grünen. Deine Aufgabe ist es, ein UMFASSENDES, ENZYKLOPÄDISCHES DOSSIER zu erstellen - ähnlich wie NotebookLM im Dossier-Modus.

**ERSTE AKTION: Umfassende Dokumentenrecherche**
Verwende SOFORT das search_grundsatz_documents Tool MEHRMALS:
1. **Hauptsuche** mit den zentralen Begriffen der Anfrage
2. **Erweiterte Suchen** mit verwandten Themen, die in den ersten Ergebnissen auftauchen
3. **Detailsuchen** nach spezifischen Zahlen, Jahreszahlen, Prozentangaben und konkreten Maßnahmen
4. **Kontextsuchen** nach Querverbindungen und übergeordneten Zusammenhängen

**VOLLSTÄNDIGKEITSPRINZIP:**
- Extrahiere JEDE relevante Information aus allen verfügbaren Dokumenten
- Sammle ALLE spezifischen Details: Zahlen, Daten, Prozentangaben, Zeiträume, Budgets
- Berücksichtige unterschiedliche Dokumenttypen und deren jeweilige Perspektiven
- Integriere Informationen nahtlos zu einer kohärenten Gesamtsicht

**ORGANISATION UND STRUKTUR:**
Organisiere deine Erkenntnisse thematisch basierend auf dem, was du TATSÄCHLICH findest:
- Lasse die Themen aus den Inhalten heraus entstehen
- Erstelle eine logische Hierarchie mit Hauptpunkten und detaillierten Unterpunkten
- Verwende nummerierte Abschnitte für bessere Übersichtlichkeit
- Füge alle konkreten Details und Spezifikationen ein

**DOSSIER-STIL (wie NotebookLM):**
- **Autoritativ und umfassend:** Schreibe wie ein professionelles Briefing-Dokument
- **Detailreich:** Jeder wichtige Aspekt wird vollständig abgedeckt
- **Spezifisch:** Alle Zahlen, Daten und konkreten Maßnahmen explizit nennen
- **Quellenintegriert:** Informationen aus verschiedenen Dokumenten nahtlos verbinden
- **Vollständig:** 20-30+ spezifische Punkte und Details pro Thema

**KEINE AUSLASSUNGEN:**
- Übersehe keine Informationen aufgrund von Länge oder Komplexität
- Integriere auch scheinbar nebensächliche, aber relevante Details
- Decke sowohl grundsätzliche Positionen als auch konkrete Umsetzungsschritte ab
- Berücksichtige zeitliche Entwicklungen und Prioritäten

Erstelle ein VOLLSTÄNDIGES DOSSIER, das alle verfügbaren Informationen zu dem angefragten Thema aus den Grünen-Dokumenten umfasst.
`;

export const SEARCH_DOCUMENTS_TOOL: SearchDocumentsTool = {
  name: 'search_documents',
  description: 'Search through the user\'s uploaded documents for information relevant to answering their question. You can call this tool multiple times with different search queries to gather comprehensive information.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant documents. Be specific and use keywords from the user\'s question.'
      },
      search_mode: {
        type: 'string',
        enum: ['vector', 'hybrid', 'keyword'],
        description: 'Search mode: vector (semantic), hybrid (semantic + keyword), or keyword (text matching). Default is hybrid for best results.'
      }
    },
    required: ['query']
  }
};

export const TITLE_GENERATION_INSTRUCTION = `\n\nBeende mit: <GRUEN_TITLE>[Kurzer Titel]</GRUEN_TITLE>`;
