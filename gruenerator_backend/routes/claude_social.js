const express = require('express');
const JSON5 = require('json5');
const router = express.Router();

const platformGuidelines = {
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
  }
};

router.post('/', async (req, res) => {
  const { thema, details, platforms = [], includeActionIdeas, useBackupProvider } = req.body;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'social',
      systemPrompt: 'Du bist Social Media Manager für Bündnis 90/Die Grünen. Erstelle Vorschläge für Social-Media-Beiträge für die angegebenen Plattformen und passe den Inhalt und Stil an jede Plattform an. Liefere deine Antwort in einem strukturierten JSON-Format.',
      messages: [{
        role: 'user',
        content: `
        Thema: ${thema}
        Details: ${details}
        Plattformen: ${platforms.join(', ')}
        
        Erstelle einen maßgeschneiderten Social-Media-Beitrag für jede ausgewählte Plattform zu diesem Thema, der den Stil und die Werte von Bündnis 90/Die Grünen widerspiegelt. Berücksichtige diese plattformspezifischen Richtlinien:

        ${platforms.map(platform => `
        ${platform.toUpperCase()}: Maximale Länge: ${platformGuidelines[platform].maxLength} Zeichen. Stil: ${platformGuidelines[platform].style} Fokus: ${platformGuidelines[platform].focus} Zusätzliche Richtlinien: ${platformGuidelines[platform].additionalGuidelines}`).join('\n')}
        ${includeActionIdeas ? 'Bitte füge 5 Aktionsideen für Soziale Medien hinzu.' : ''}

        Jeder Beitrag sollte:
        1. Ein eigener Beitragstext angepasst an die spezifische Plattform und deren Zielgruppe sein.
        2. Mit einer aufmerksamkeitsstarken Einleitung beginnen.
        3. Wichtige Botschaften klar und prägnant vermitteln.
        4. Emojis und Hashtags passend zur Plattform verwenden.
        5. Themen wie Klimaschutz, soziale Gerechtigkeit und Vielfalt betonen.
        6. Aktuelle Positionen der Grünen Partei einbeziehen.
        7. Bei Bedarf auf weiterführende Informationen verweisen (z.B. Webseite).

        Liefere deine Antwort im folgenden JSON-Format:
        {
          "facebook": {
            "title": "Facebook",
            "content": "Beitragsinhalt hier mit #hashtags im Text..."
          },
          "instagram": {
            "title": "Instagram",
            "content": "Beitragsinhalt hier mit #hashtags im Text..."
          },
          "twitter": {
            "title": "Twitter",
            "content": "Beitragsinhalt hier mit #hashtags im Text..."
          },
          "linkedin": {
            "title": "LinkedIn",
            "content": "Beitragsinhalt hier mit #hashtags im Text..."
          },
          "actionIdeas": [
            "Aktionsidee 1",
            "Aktionsidee 2",
            "Aktionsidee 3"
          ],
          "reelScript": {
            "title": "Instagram Reel Skript (60 Sekunden)",
            "content": "Skriptinhalt mit [visuellen Beschreibungen] und Zeitmarkierungen..."
          }
        }

        Füge nur Abschnitte für die angeforderten Plattformen ein. Wenn keine Aktionsideen angefordert wurden, lasse das Feld "actionIdeas" weg.`
      }],
      options: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.9
      },
      useBackupProvider
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // JSON Parsing und Sanitization
    const sanitizeResponse = (responseText) => {
      let trimmed = responseText.trim();
      return trimmed.replace(/("(?:title|content)":\s*")([^"]*)"/g, (match, p1, p2) => {
        return p1 + p2.replace(/\n/g, "\\n") + '"';
      });
    };

    try {
      const sanitizedText = sanitizeResponse(result.content);
      const content = JSON5.parse(sanitizedText);

      const filteredContent = Object.fromEntries(
        Object.entries(content).filter(([key]) => 
          platforms.includes(key) || (includeActionIdeas && key === 'actionIdeas')
        )
      );

      res.json({ 
        content: filteredContent,
        metadata: result.metadata
      });
    } catch (parseError) {
      console.error('JSON Parsing Error:', parseError);
      res.status(500).json({
        error: 'Fehler beim Parsen der KI-Antwort',
        details: parseError.message
      });
    }

  } catch (error) {
    console.error('Fehler bei der Social Media Content Erstellung:', error);
    res.status(500).json({
      error: 'Fehler bei der Verarbeitung',
      details: error.message
    });
  }
});

module.exports = router;