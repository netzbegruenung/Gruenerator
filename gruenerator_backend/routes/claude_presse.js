const express = require('express');
const router = express.Router();
const AIRequestManager = require('../utils/AIRequestManager');

router.post('/', async (req, res) => {
  const { was, wie, zitatgeber, pressekontakt } = req.body;

  try {
    const result = await AIRequestManager.processRequest({
      type: 'presse',
      systemPrompt: `Agiere als Pressesprecher einer Gliederung von Bündnis 90/Die Grünen und schreibe eine Pressemitteilung für den Presseverteiler. 
      
Schreiben Sie in folgendem Stil, Sprachstil und Tonfall: 
- Der Text ist förmlich und sachlich und verwendet einen geradlinigen Berichtsstil. 
- Es werden komplexe Sätze und eine Mischung aus zusammengesetzten und komplexen Satzstrukturen verwendet, was zu einem professionellen und informativen Ton beiträgt.  
- Die Verwendung von spezifischen Begriffen und Namen verleiht dem Text einen autoritären Charakter.  
- Der Text enthält auch direkte Zitate, die nahtlos eingefügt werden sollten, um den autoritativen und sachlichen Ton beizubehalten. 

Achten Sie bei der Umsetzung dieses Stils auf Klarheit, Präzision und eine ausgewogene Struktur Ihrer Sätze, um eine formale und objektive Darstellung der Informationen zu gewährleisten.`,
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: `Was: ${was}
Wie: ${wie}
Zitat von: ${zitatgeber}
Pressekontakt: ${pressekontakt}`
        }]
      }],
      options: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        temperature: 0.3
      }
    });

    if (!result.success) throw new Error(result.error);
    res.json({ content: result.result });
  } catch (error) {
    console.error('Fehler bei der Pressemitteilungserstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung der Pressemitteilung',
      details: error.message 
    });
  }
});

module.exports = router;
