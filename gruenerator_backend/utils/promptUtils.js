const HTML_FORMATTING_INSTRUCTIONS = `
**Formatierung:** Bitte formatiere die GESAMTE Ausgabe als HTML. 
- Verwende <h2>-Tags für die Hauptüberschriften (z.B. "Einstiegsideen", "Kernargumente", "Tipps", "Rede").
- Verwende <h3>-Tags für Unterüberschriften und <h4>-Tags für weitere Unterteilungen.
- Verwende <p>-Tags für **jeden einzelnen** Textabsatz unterhalb der Überschriften und innerhalb der Rede. Jeder Gedanke oder logische Block, der einen Absatz darstellt, muss in eigenen <p>...</p>-Tags stehen. Verwende **keine** <br>-Tags, um Absätze zu simulieren.
- Verwende <strong> für wichtige Stichworte *innerhalb* von Absätzen, falls nötig.
- Stelle sicher, dass nach einem Doppelpunkt (z.B. nach einer <h2>-Überschrift) immer ein Leerzeichen folgt, bevor der nächste Text oder eine Liste beginnt.
- Verwende <ul> und <li> für Listenpunkte bei den Ideen und Tipps.
- Füge **keine** zusätzlichen Zeilenumbrüche (newline characters wie '\\n') in den HTML-Code ein, weder innerhalb noch zwischen den Tags. Der einzige Inhalt zwischen </p> und <p> oder zwischen </h2> und <p> sollte Leerraum (whitespace) sein, keine Zeilenumbrüche.
- KEINEN Markdown verwenden.
`;

/**
 * Checks if a custom prompt is structured (contains instruction/knowledge headers)
 * @param {string} customPrompt - The custom prompt to check
 * @returns {boolean} True if the prompt is structured
 */
const isStructuredPrompt = (customPrompt) => {
  if (!customPrompt || typeof customPrompt !== 'string') {
    return false;
  }
  
  return customPrompt.includes('Der User gibt dir folgende Anweisungen') || 
         customPrompt.includes('Der User stellt dir folgendes, wichtiges Wissen');
};

/**
 * Formats user content based on whether the custom prompt is structured or legacy
 * @param {object} params - Parameters object
 * @param {string} params.customPrompt - The custom prompt from the user
 * @param {string} params.baseContent - Base content to append
 * @param {string} params.currentDate - Current date string
 * @param {string} params.additionalInfo - Additional information to include
 * @returns {string} Formatted user content
 */
const formatUserContent = ({ customPrompt, baseContent, currentDate, additionalInfo = '' }) => {
  if (!customPrompt) {
    return baseContent;
  }
  
  const structured = isStructuredPrompt(customPrompt);
  
  if (structured) {
    // Strukturierte Anweisungen und Wissen direkt verwenden
    return `${customPrompt}

---

Aktuelles Datum: ${currentDate}

${additionalInfo}

${baseContent}`;
  } else {
    // Legacy: Bei benutzerdefiniertem Prompt diesen verwenden
    return `Benutzerdefinierter Prompt: ${customPrompt}

Aktuelles Datum: ${currentDate}

${additionalInfo}

${baseContent}`;
  }
};

const PLATFORM_SPECIFIC_GUIDELINES = {
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
    style: "Visual, fun, and snappy. Heavy use of emojis and hashtags.",
    focus: "Visual appeal, lifestyle content, behind-the-scenes glimpses.",
    additionalGuidelines: `
      - Use plenty of emojis to visually emphasize emotions and messages.
      - Keep paragraphs short and scannable.
      - Share clear, engaging political messages that resonate emotionally.
      - Use hashtags strategically to increase reach.
      - End the post with a call to action or a question.
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



const MARKDOWN_CHAT_INSTRUCTIONS = `
**Formatierung und Stil der Chat-Antwort:**
Bitte formatiere deine Antwort als Markdown und beachte folgende Punkte für einen natürlichen Chat-Verlauf:

1.  **Schreibe wie ein Mensch in einem Messenger (z.B. Signal, WhatsApp):**
    *   Formuliere kurze, prägnante Nachrichtenblöcke.
    *   Jeder Block sollte idealerweise nur wenige Sätze (z.B. 2-5 Sätze) umfassen und einen abgeschlossenen Gedanken oder eine klare Information enthalten.
    *   Vermeide lange, verschachtelte Sätze. Bevorzuge einfache und direkte Sprache.

2.  **Natürliche Aufteilung mit '%%%MSG_SPLIT%%%':**
    *   Wenn deine gesamte Antwort mehrere solcher kurzen Gedankengänge oder Informationsblöcke enthält, trenne diese bitte mit dem speziellen Trenner \`%%%MSG_SPLIT%%%\`
        Jeder so getrennte Teil wird als eigene Chat-Nachricht angezeigt.
    *   Setze den Trenner dort, wo ein natürlicher Übergang zu einer neuen Nachricht sinnvoll ist. Teile keine Sätze oder unmittelbare Gedankengänge.
    *   Beispiel:
        "Hallo! Das ist der erste Gedanke. Er ist kurz und bündig.
        %%%MSG_SPLIT%%%
        Hier kommt der zweite Punkt. Auch dieser ist leicht verständlich.
        %%%MSG_SPLIT%%%
        Und das ist eine abschließende Bemerkung."

3.  **Qualität vor strikter Kürze:**
    *   Das Ziel sind gut lesbare, natürliche Chat-Nachrichten.
    *   Wenn ein Gedanke für die Klarheit etwas mehr Länge benötigt, ist das in Ordnung. Eine etwas längere, aber kohärente Nachricht ist besser als ein unnatürlicher Schnitt.
    *   Verwende den Trenner \`%%%MSG_SPLIT%%%\` nur, wenn es wirklich thematische oder logische Pausen gibt, die eine neue Nachricht rechtfertigen.
        Wenn deine Antwort von Natur aus kurz ist und keine Aufteilung benötigt, verwende den Trenner nicht.

4.  **Markdown-Nutzung:**
    *   Verwende Markdown für Hervorhebungen (Fett, Kursiv), Listen und ggf. sehr einfache Überschriften (z.B. \`###\`), um die Lesbarkeit zu verbessern.
    *   KEIN HTML in dieser Chat-Antwort verwenden.
`;

const JSON_OUTPUT_FORMATTING_INSTRUCTIONS = `
**WICHTIG: JSON Formatierungsregeln für die Antwort:**
Du MUSST deine Antwort im folgenden JSON-Format geben. Stelle absolut sicher, dass das JSON valide ist.
Alle String-Werte innerhalb des JSON, insbesondere die Felder "response" und "newText", müssen korrekt escaped sein.
Das bedeutet:
- Zeilenumbrüche müssen als die zwei Zeichen '\\\\n' (Backslash gefolgt von n) dargestellt werden.
- Anführungszeichen (" innerhalb von Strings müssen als '\\\\\\\"' (Backslash gefolgt von Anführungszeichen) escaped werden.
- Tabulatoren müssen als '\\\\t' (Backslash gefolgt von t) escaped werden.
- Backslashes (\\\\) müssen als '\\\\\\\\' (doppelter Backslash) escaped werden.
- Andere Steuerzeichen sollten ebenfalls gemäß JSON-Standard escaped werden (z.B. \\\\b, \\\\f, \\\\r).

Beispiel für einen korrekt escapten String-Wert innerhalb des JSON:
"Dies ist Zeile 1.\\\\nDies ist Zeile 2 mit einem \\\\\\\"Zitat\\\\\\\" und einem Backslash \\\\\\\\.\"

Das JSON-Objekt muss folgende Struktur haben:
{
  "response": "Hier deine Erklärung der Änderungen oder deine Antwort, formatiert für die Chat-Anzeige gemäß ${MARKDOWN_CHAT_INSTRUCTIONS}. Der eigentliche bearbeitete Text gehört NICHT hierher, sondern ausschließlich in das Feld 'newText'. (Achte auf korrektes Escaping für JSON, z.B. Zeilenumbrüche als \\\\n)",
  "textAdjustment": {
    "type": "selected", // oder "full", je nach Anwendungsfall
    "newText": "Hier der neue oder angepasste Text, exakt so, wie er im Editor erscheinen soll. Für reinen Text mit Zeilenumbrüchen (z.B. Gedichte) stelle sicher, dass Zeilenumbrüche korrekt als \\\\n im JSON-String escaped sind. Für Rich-Text-Inhalte können (${HTML_FORMATTING_INSTRUCTIONS}) relevant sein. (Achte auf korrektes Escaping für JSON)"
    // "oldText": null, // nur bei type "full" relevant
  }
}
Stelle sicher, dass die Platzhalter ${MARKDOWN_CHAT_INSTRUCTIONS} und ${HTML_FORMATTING_INSTRUCTIONS} NICHT in deiner finalen JSON-Antwort enthalten sind, sondern dass du deren Anweisungen für den Inhalt der jeweiligen Felder befolgst.
`;

module.exports = {
  HTML_FORMATTING_INSTRUCTIONS,
  PLATFORM_SPECIFIC_GUIDELINES,
  MARKDOWN_CHAT_INSTRUCTIONS,
  JSON_OUTPUT_FORMATTING_INSTRUCTIONS,
  isStructuredPrompt,
  formatUserContent
}; 