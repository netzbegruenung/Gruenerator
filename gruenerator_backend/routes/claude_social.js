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
      systemPrompt: 'You are a Social Media Manager for Bündnis 90/Die Grünen. Create social media post suggestions for the specified platforms, adapting the content and style to each platform. Provide your response in a structured JSON format.',
      messages: [{
        role: 'user',
        content: `
        Theme: ${thema}
        Details: ${details}
        Platforms: ${platforms.join(', ')}
        
        Create a tailored social media post for each selected platform on this theme, reflecting the style and values of Bündnis 90/Die Grünen. Consider these platform-specific guidelines:

        ${platforms.map(platform => `
        ${platform.toUpperCase()}: Max length: ${platformGuidelines[platform].maxLength} characters. Style: ${platformGuidelines[platform].style} Focus: ${platformGuidelines[platform].focus} Additional guidelines: ${platformGuidelines[platform].additionalGuidelines}`).join('\n')}
        ${includeActionIdeas ? 'Bitte füge 5 Aktionsideen für Soziale Medien hinzu.' : ''}

        Jeder Post sollte:
        1. Ein eigener Beitragstext angepasst an die spezifische Plattform und deren Zielgruppe sein.
        2. Mit einer aufmerksamkeitsstarken Einleitung beginnen.
        3. Wichtige Botschaften klar und prägnant vermitteln.
        4. Emojis und Hashtags passend zur Plattform verwenden.
        5. Themen wie Klimaschutz, soziale Gerechtigkeit und Vielfalt betonen.
        6. Aktuelle Positionen der Grünen Partei einbeziehen.
        7. Bei Bedarf auf weiterführende Informationen verweisen (z.B. Webseite).

        Provide your response in the following JSON format:
        {
          "facebook": {
            "title": "Facebook",
            "content": "Post content here including #hashtags within the text..."
          },
          "instagram": {
            "title": "Instagram",
            "content": "Post content here including #hashtags within the text..."
          },
          "twitter": {
            "title": "Twitter",
            "content": "Post content here including #hashtags within the text..."
          },
          "linkedin": {
            "title": "LinkedIn",
            "content": "Post content here including #hashtags within the text..."
          },
          "actionIdeas": [
            "Action idea 1",
            "Action idea 2",
            "Action idea 3"
          ],
          "reelScript": {
            "title": "Instagram Reel Script (60 Sekunden)",
            "content": "Script content with [visual descriptions] and timing markers..."
          }
        }

        Only include sections for the requested platforms. If no action ideas were requested, omit the "actionIdeas" field.`
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