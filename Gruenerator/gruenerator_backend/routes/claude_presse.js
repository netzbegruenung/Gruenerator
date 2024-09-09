const express = require('express');
const { Anthropic } = require('@anthropic-ai/sdk');
const router = express.Router();
require('dotenv').config(); // Lädt die .env Datei

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

router.route('/')
  .post(async (req, res) => {
    const { was, wie, zitatgeber, pressekontakt } = req.body;
    console.log('Using API Key:', process.env.CLAUDE_API_KEY); // Debug-Ausgabe

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        system: `Agiere als Pressesprecher einer Gliederung von Bündnis 90/Die Grünen und schreibe eine Pressemitteilung für den Presseverteiler. Schreiben Sie in folgendem Stil, Sprachstil und Tonfall: Der Text ist förmlich und sachlich und verwendet einen geradlinigen Berichtsstil. Es werden komplexe Sätze und eine Mischung aus zusammengesetzten und komplexen Satzstrukturen verwendet, was zu einem professionellen und informativen Ton beiträgt.  Die Verwendung von spezifischen Begriffen und Namen verleiht dem Text einen autoritären Charakter.  Der Text enthält auch direkte Zitate, die nahtlos eingefügt werden sollten, um den autoritativen und sachlichen Ton beizubehalten. Achten Sie bei der Umsetzung dieses Stils auf Klarheit, Präzision und eine ausgewogene Struktur Ihrer Sätze, um eine formale und objektive Darstellung der Informationen zu gewährleisten.`,
        messages: [
          {
            role: "user",
            content: `Was: ${was} Wie: ${wie} Zitat von: ${zitatgeber} Pressekontakt: ${pressekontakt}`
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
