const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const JSON5 = require('json5'); // JSON5 für tolerantes Parsen
const router = express.Router();
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

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
  }
};

router.route('/')
  .post(async (req, res) => {
    const { thema, details, platforms, includeActionIdeas } = req.body;
    console.log('Received request:', { thema, details, platforms, includeActionIdeas });

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.9,
        system: `You are a Social Media Manager for Bündnis 90/Die Grünen. Create social media post suggestions for the specified platforms, adapting the content and style to each platform. Provide your response in a structured JSON format.`,
        messages: [
          {
            role: "user",
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
              ]
            }

            Only include sections for the requested platforms. If no action ideas were requested, omit the "actionIdeas" field.
            `
          }
        ]
      });

      console.log('Raw API response:', JSON.stringify(response, null, 2));
      console.log('Raw response text:', response.content[0].text);

      const sanitizeResponse = (responseText) => {
        // Entferne führende und nachfolgende Leerzeichen
        let trimmed = responseText.trim();
        
        // Ersetze Zeilenumbrüche innerhalb von Anführungszeichen durch \n
        return trimmed.replace(/("(?:title|content)":\s*")([^"]*)"/g, (match, p1, p2) => {
          return p1 + p2.replace(/\n/g, "\\n") + '"';
        });
      };
      

     
      if (response && response.content && Array.isArray(response.content)) {
        console.log('Response content:', response.content);
        let content;
        let fullText;
        try {
          console.log('Raw response text:', response.content[0].text);
          
          // Extrahiere den Text aus der Antwort und führe die Vorverarbeitung durch
          fullText = sanitizeResponse(response.content[0].text);
          console.log('Sanitized response text (first 500 chars):', fullText.substring(0, 500));
      
          // Versuche, die JSON-Antwort zu parsen
          content = JSON5.parse(fullText);
          console.log('Parsed content:', JSON.stringify(content, null, 2));
        } catch (parseError) {
          console.error('Error parsing response content:', parseError);
          console.error('Problematic JSON:', fullText);
          console.error('Error details:', {
            message: parseError.message,
            position: parseError.columnNumber,
            snippet: fullText.substring(Math.max(0, parseError.columnNumber - 20), parseError.columnNumber + 20)
          });
          res.status(500).send('Error parsing API response');
          return;
      }
        // Filter out platforms that weren't requested
        const filteredContent = Object.fromEntries(
          Object.entries(content).filter(([key]) => 
            platforms.includes(key) || (includeActionIdeas && key === 'actionIdeas')
          )
        );

        console.log('Filtered content to be sent to client:', JSON.stringify(filteredContent, null, 2));
        res.json(filteredContent);
      } else {
        console.error('API response missing or incorrect content structure:', JSON.stringify(response, null, 2));
        res.status(500).send('API response missing or incorrect content structure');
      }
    } catch (error) {
      console.error('Error with Claude API:', error.message);
      if (typeof fullText !== 'undefined') {
        console.error('Problematic text:', fullText.substring(0, 100)); // Zeige die ersten 100 Zeichen
      } else {
        console.error('fullText is undefined');
      }
      console.error('Full error object:', JSON.stringify(error, null, 2));
      res.status(500).send('Internal Server Error');
    }
  });

module.exports = router;