const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

const platformGuidelines = {
  facebook: {
    maxLength: 600,
    style: "Casual and conversational. Use emojis sparingly.",
    focus: "Community engagement, longer-form content, visual storytelling."
  },
  instagram: {
    maxLength: 600,
    style: "Visual, fun, and snappy. Heavy use of emojis and hashtags.",
    focus: "Visual appeal, lifestyle content, behind-the-scenes glimpses."
  },
  twitter: {
    maxLength: 280,
    style: "Concise and witty. Use hashtags strategically.",
    focus: "Real-time updates, quick facts, calls-to-action."
  },
  linkedin: {
    maxLength: 600,
    style: "Professional yet approachable. Minimal use of emojis.",
    focus: "Industry insights, policy discussions, professional development."
  }
};

router.route('/')
  .post(async (req, res) => {
    const { thema, details, platforms } = req.body;
    console.log('Using API Key:', process.env.CLAUDE_API_KEY);

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.9,
        system: `Du bist Social-Media-Manager von Bündnis 90/Die Grünen. Erstelle Vorschläge für Social-Media Beitragstexte für die angegebenen Plattformen. Passe den Inhalt und Stil an die jeweilige Plattform an.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Thema: ${thema} 
                Details: ${details} 
                Plattformen: ${platforms.join(', ')}
                
                Erstelle für jede ausgewählte Plattform einen angepassten Social-Media-Beitrag zu diesem Thema, der den Stil und die Werte von Bündnis 90/Die Grünen widerspiegelt. Beachte dabei die folgenden plattformspezifischen Richtlinien:

                ${platforms.map(platform => `
                ${platform.toUpperCase()}:
                - Maximale Länge: ${platformGuidelines[platform].maxLength} Zeichen
                - Stil: ${platformGuidelines[platform].style}
                - Fokus: ${platformGuidelines[platform].focus}
                `).join('\n')}

                Jeder Beitrag sollte zudem:
                1. An die spezifische Plattform und deren Zielgruppe angepasst sein
                2. Informelle, bürgernahe Sprache im "Du"-Stil verwenden
                3. Mit einer aufmerksamkeitsstarken Einleitung beginnen
                4. Kernbotschaften klar und prägnant vermitteln
                5. Emojis und Hashtags plattformgerecht einsetzen
                6. Mit einem Aufruf zum Handeln oder einer Frage enden
                7. Einen engagierten, positiven Ton haben
                8. Aspekte wie Klimaschutz, soziale Gerechtigkeit und Vielfalt betonen
                9. Aktuelle grüne Politikpositionen einbinden
                10. Bei Bedarf auf weiterführende Informationen (z.B. Website) verweisen

                Gib die Beiträge im folgenden Format aus:

                [Plattform 1]:
                [Beitragstext für Plattform 1]

                [Plattform 2]:
                [Beitragstext für Plattform 2]

                ...

                Zusätzlich, gib 2-3 plattformübergreifende Aktionsideen an:

                Aktionsideen:
                - [Idee 1]
                - [Idee 2]
                - [Idee 3]`
              }
            ]
          }
        ]
      });

      if (response && response.content && Array.isArray(response.content)) {
        const textContent = response.content.map(item => item.text).join("\n");
        res.json({ content: textContent });
      } else {
        console.error('API response missing or incorrect content structure:', response);
        res.status(500).send('API response missing or incorrect content structure');
      }
    } catch (error) {
      console.error('Error with Claude API:', error.response ? error.response.data : error.message);
      res.status(500).send('Internal Server Error');
    }
  });

module.exports = router;