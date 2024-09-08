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
    style: "Locker und gesprächig. Verwende Emojis sparsam.",
    focus: "Community-Engagement, längere Inhalte, visuelles Storytelling.",
    additionalGuidelines: `
      - Verwende eine persönliche, direkte Ansprache ("Du").
      - Nutze einen freundlichen und lockeren Stil, der Diskussionen fördert.
      - Verwende visuelle Elemente zur Unterstützung des Textes.
      - Emojis und Hashtags nur sparsam einsetzen.
      - Beende den Beitrag mit einer klaren Handlungsaufforderung.
    `
  },
  instagram: {
    maxLength: 600,
    style: "Visuell, unterhaltsam und kurz. Viele Emojis und Hashtags.",
    focus: "Visuelle Attraktivität, Lifestyle-Inhalte, Einblicke hinter die Kulissen.",
    additionalGuidelines: `
      - Verwende viele Emojis, um Emotionen und Botschaften visuell zu unterstreichen.
      - Halte die Absätze kurz und leserfreundlich, um das Scannen des Textes zu erleichtern.
      - Teile klare, engagierte politische Botschaften, die emotional ansprechend sind.
      - Nutze Hashtags strategisch, um die Reichweite zu erhöhen.
      - Beende den Beitrag mit einer Handlungsaufforderung oder einer Frage.
    `
  },
  twitter: {
    maxLength: 280,
    style: "Prägnant und witzig. Verwende Hashtags strategisch.",
    focus: "Echtzeit-Updates, schnelle Fakten, Handlungsaufforderungen.",
    additionalGuidelines: `
      - Klare, direkte Sprache ohne unnötige Ausschweifungen.
      - Präsentiere klare politische Positionen zu aktuellen Themen (z.B. Klimaschutz, soziale Gerechtigkeit).
      - Nutze eine "Du"-Ansprache, um den Leser direkt zu involvieren.
      - Verwende Hashtags strategisch (#Klimaschutz, #LandesstimmeGRÜN), aber übertreibe es nicht.
      - Emojis sparsam und nur unterstützend einsetzen (z.B. 💚).
      - Beginne mit einem Aufhänger oder einer klaren Aussage.
      - Beende den Beitrag mit einer Handlungsaufforderung oder einer Frage.
    `
  },
  linkedin: {
    maxLength: 600,
    style: "Professionell, aber zugänglich. Minimaler Einsatz von Emojis.",
    focus: "Branchenkenntnisse, politische Diskussionen, berufliche Weiterentwicklung.",
    additionalGuidelines: `
      - Professioneller, aber zugänglicher Ton.
      - Teile Einblicke und Analysen zu aktuellen Themen oder Trends.
      - Stelle Zusammenhänge zwischen Politik und beruflicher Entwicklung her.
      - Emojis sparsam verwenden, Hashtags nicht übermäßig nutzen.
      - Beende den Beitrag mit einer Handlungsaufforderung oder einer Frage, die auf berufliches Engagement abzielt.
    `
  }
};

const processContent = (content) => {
  const processedContent = {};
  for (const [key, value] of Object.entries(content)) {
    if (key === 'actionIdeas') {
      processedContent[key] = Array.isArray(value) ? value : [];
    } else {
      processedContent[key] = {
        title: value.title || key,
        content: value.content || '',
        hashtags: Array.isArray(value.hashtags) ? value.hashtags : []
      };
    }
  }
  return processedContent;
};

router.route('/')
  .post(async (req, res) => {
    const { thema, details, platforms, includeActionIdeas } = req.body;
    console.log('Empfangene Anfrage:', { thema, details, platforms, includeActionIdeas });

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.9,
        system: `Du bist Social Media Manager von Bündnis 90/Die Grünen. Erstelle Vorschläge für Social Media Posts für die angegebenen Plattformen und passe den Inhalt sowie den Stil an jede Plattform an. Gib deine Antwort in einem strukturierten JSON-Format zurück.`,
        messages: [
          {
            role: "user",
            content: `
            Thema: ${thema}
            Details (optional): ${details}
            Plattformen: ${platforms.join(', ')}
            
            Erstelle für jede ausgewählte Plattform einen maßgeschneiderten Social Media Post zu diesem Thema, der den Stil und die Werte von Bündnis 90/Die Grünen widerspiegelt. Berücksichtige dabei die plattformspezifischen Richtlinien:

            ${platforms.map(platform => `
            ${platform.toUpperCase()}: Maximale Länge: ${platformGuidelines[platform].maxLength} Zeichen. Stil: ${platformGuidelines[platform].style}. Fokus: ${platformGuidelines[platform].focus}.
            Beitragsrichtlinien: ${platformGuidelines[platform].additionalGuidelines}`).join('\n')}

            ${includeActionIdeas ? 'Bitte füge 5 Aktionsideen für Soziale Medien hinzu.' : ''}

            Jeder Post sollte:
            1. An die spezifische Plattform und deren Zielgruppe angepasst sein.
            2. Mit einer aufmerksamkeitsstarken Einleitung beginnen.
            3. Wichtige Botschaften klar und prägnant vermitteln.
            4. Emojis und Hashtags passend zur Plattform verwenden.
            5. Themen wie Klimaschutz, soziale Gerechtigkeit und Vielfalt betonen.
            6. Aktuelle Positionen der Grünen Partei einbeziehen.
            7. Bei Bedarf auf weiterführende Informationen verweisen (z.B. Webseite).

            Gib deine Antwort im folgenden JSON-Format zurück:
            {
              "facebook": {
                "title": "Facebook",
                "content": "Post-Inhalt hier...",
                "hashtags": ["#hashtag1", "#hashtag2"]
              },
              "instagram": {
                "title": "Instagram",
                "content": "Post-Inhalt hier...",
                "hashtags": ["#hashtag1", "#hashtag2"]
              },
              "twitter": {
                "title": "Twitter",
                "content": "Post-Inhalt hier...",
                "hashtags": ["#hashtag1", "#hashtag2"]
              },
              "linkedin": {
                "title": "LinkedIn",
                "content": "Post-Inhalt hier...",
                "hashtags": ["#hashtag1", "#hashtag2"]
              },
              "actionIdeas": [
                "Aktionsidee 1",
                "Aktionsidee 2",
                "Aktionsidee 3"
              ]
            }

            Gib nur Abschnitte für die angeforderten Plattformen an. Wenn keine Aktionsideen gewünscht sind, lasse das Feld "actionIdeas" weg.
            `
          }
        ]
      });

      console.log('Rohantwort der API:', JSON.stringify(response, null, 2));

      if (response && response.content && Array.isArray(response.content)) {
        console.log('Antwortinhalt:', response.content);
        let content;
        try {
          const fullText = response.content[0].text;
          console.log('Vollständige Textantwort:', fullText);

          content = JSON.parse(fullText);
          console.log('Geparster Inhalt:', JSON.stringify(content, null, 2));
        } catch (parseError) {
          console.error('Fehler beim Parsen der Antwort:', parseError);
          return res.status(500).json({ error: 'Fehler beim Parsen der API-Antwort', details: parseError.message });
        }
        
        let processedContent = processContent(content);
        
        const filteredContent = Object.fromEntries(
          Object.entries(processContent).filter(([key]) => 
            platforms.includes(key) || (includeActionIdeas && key === 'actionIdeas')
          )
        );

        if (includeActionIdeas && !filteredContent.actionIdeas) {
          filteredContent.actionIdeas = ["Keine Aktionsideen verfügbar"];
        }

        console.log('Gefilterter Inhalt für den Client:', JSON.stringify(filteredContent, null, 2));
        res.json(filteredContent);
      } else {
        console.error('Fehlende oder inkorrekte API-Antwortstruktur:', JSON.stringify(response, null, 2));
        res.status(500).json({ error: 'Fehlende oder inkorrekte API-Antwortstruktur' });
      }
    } catch (error) {
      console.error('Fehler bei der Claude API:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
      res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
    }
  });

module.exports = router;
