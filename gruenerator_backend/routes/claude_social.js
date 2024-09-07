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
            ${platform.toUpperCase()}: Max length: ${platformGuidelines[platform].maxLength} characters. Style: ${platformGuidelines[platform].style} Focus: ${platformGuidelines[platform].focus}`).join('\n')}

            Each post should:
            1. Be adapted to the specific platform and its audience
            2. Use informal, citizen-friendly language in the "Du" style
            3. Start with an attention-grabbing introduction
            4. Convey key messages clearly and concisely
            5. Use emojis and hashtags appropriately for the platform
            6. End with a call to action or a question
            7. Have an engaging, positive tone
            8. Emphasize aspects like climate protection, social justice, and diversity
            9. Incorporate current Green Party policy positions
            10. Reference further information (e.g., website) when needed

            Provide your response in the following JSON format:
            {
              "facebook": {
                "title": "Facebook",
                "content": "Post content here...",
                "hashtags": ["#hashtag1", "#hashtag2"]
              },
              "instagram": {
                "title": "Instagram",
                "content": "Post content here...",
                "hashtags": ["#hashtag1", "#hashtag2"]
              },
              "twitter": {
                "title": "Twitter",
                "content": "Post content here...",
                "hashtags": ["#hashtag1", "#hashtag2"]
              },
              "linkedin": {
                "title": "LinkedIn",
                "content": "Post content here...",
                "hashtags": ["#hashtag1", "#hashtag2"]
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

      // Process API response
      if (response && response.content && Array.isArray(response.content)) {
        console.log('Response content:', response.content);
        let content;
        try {
          // Extrahieren des gesamten Textes aus der Antwort
          const fullText = response.content[0].text;
          console.log('Full text response:', fullText);

          // Versuchen, den gesamten Text als JSON zu parsen
          content = JSON.parse(fullText);
          console.log('Parsed content:', JSON.stringify(content, null, 2));
        } catch (parseError) {
          console.error('Error parsing response content:', parseError);
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
      console.error('Error with Claude API:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
      console.error('Full error object:', JSON.stringify(error, null, 2));
      res.status(500).send('Internal Server Error');
    }
  });

module.exports = router;