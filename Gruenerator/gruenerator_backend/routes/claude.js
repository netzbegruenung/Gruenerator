const express = require('express');
const { Anthropic } = require('@anthropic-ai/sdk');
const router = express.Router();
require('dotenv').config(); // Lädt die .env Datei

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

router.route('/')
  .post(async (req, res) => {
    const { idee, details, gliederung } = req.body;

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.3, 
        system: `Du bist Kommunalpolitiker einer Gliederung von Bündnis 90/Die Grünen. Der User gibt dir Idee sowie Details und Gliederungsname. Entwirf einen Antrag für deine Kommune.`,
        messages: [
          {
            role: "user",
            content: `Idee: ${idee}, Details: ${details}, Gliederungsname: ${gliederung}`
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
