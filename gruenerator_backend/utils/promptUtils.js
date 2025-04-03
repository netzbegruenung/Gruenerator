const HTML_FORMATTING_INSTRUCTIONS = `
**Formatierung:** Bitte formatiere die GESAMTE Ausgabe als HTML. 
- Verwende <h2>-Tags für die Hauptüberschriften (z.B. "Einstiegsideen", "Kernargumente", "Tipps", "Rede").
- Verwende <p>-Tags für **jeden einzelnen** Textabsatz unterhalb der Überschriften und innerhalb der Rede. Jeder Gedanke oder logische Block, der einen Absatz darstellt, muss in eigenen <p>...</p>-Tags stehen. Verwende **keine** <br>-Tags, um Absätze zu simulieren.
- Verwende <strong> für wichtige Stichworte *innerhalb* von Absätzen, falls nötig.
- Stelle sicher, dass nach einem Doppelpunkt (z.B. nach einer <h2>-Überschrift) immer ein Leerzeichen folgt, bevor der nächste Text oder eine Liste beginnt.
- Verwende <ul> und <li> für Listenpunkte bei den Ideen und Tipps.
- Füge **keine** zusätzlichen Zeilenumbrüche (newline characters wie '\\n') in den HTML-Code ein, weder innerhalb noch zwischen den Tags. Der einzige Inhalt zwischen </p> und <p> oder zwischen </h2> und <p> sollte Leerraum (whitespace) sein, keine Zeilenumbrüche.
- KEINEN Markdown verwenden.
`;

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

const PLATFORM_HEADER_STRUCTURE_INSTRUCTIONS = `
Plattform-Struktur: Für jede Plattform muss die folgende Struktur EXAKT eingehalten werden:
1. Ein umschließender <div class="platform-section" data-platform="PLATFORM_NAME"> (PLATFORM_NAME in Großbuchstaben)
2. INNERHALB dieses divs MUSS als erstes Element eine <h2>-Überschrift mit dem Plattformnamen stehen
3. Danach folgt der plattformspezifische Inhalt gemäß den HTML-Formatierungsregeln

Beispiel der EXAKTEN Struktur:
<div class="platform-section" data-platform="FACEBOOK">
<h2>FACEBOOK</h2>
<p>Dies ist der Inhalt für Facebook.</p>
</div>
<div class="platform-section" data-platform="INSTAGRAM">
<h2>INSTAGRAM</h2>
<p>Inhalt für Instagram...</p>
</div>
`;

module.exports = {
  HTML_FORMATTING_INSTRUCTIONS,
  PLATFORM_SPECIFIC_GUIDELINES,
  PLATFORM_HEADER_STRUCTURE_INSTRUCTIONS
}; 