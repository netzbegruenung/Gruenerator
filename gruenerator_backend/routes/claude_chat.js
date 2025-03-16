const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { message, currentText, selectedText, cursorPosition } = req.body;

  if (!message || !currentText) {
    return res.status(400).json({ error: 'message und currentText sind erforderlich.' });
  }

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt: `Du bist ein hilfreicher Assistent für Textbearbeitung. 
Antworte IMMER in diesem JSON Format:
{
  "response": "Deine kurze Erklärung was du geändert hast",
  "textAdjustment": {
    "newText": "Der neue Text",
    "range": {
      "index": number,
      "length": number
    }
  }
}`,
      messages: [
        {
          role: "user",
          content: `Aktueller Text: "${currentText}"
${cursorPosition ? `Cursor Position: ${cursorPosition}` : ''}
${selectedText ? `Markierter Text: "${selectedText}"` : ''}

Benutzer: ${message}`
        }
      ]
    });

    if (result.success) {
      try {
        const response = typeof result.content === 'string' 
          ? JSON.parse(result.content) 
          : result.content;

        if (response.response && response.textAdjustment?.newText && 
            typeof response.textAdjustment.range?.index === 'number' && 
            typeof response.textAdjustment.range?.length === 'number') {
          console.log('Claude Antwort:', response.response);
          res.json(response);
        } else {
          res.status(400).json({ 
            error: 'Ungültiges Antwortformat von Claude',
            content: result.content
          });
        }
      } catch (parseError) {
        res.status(400).json({ 
          error: 'JSON Parse Error',
          details: parseError.message,
          content: result.content
        });
      }
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Fehler bei der Chat-Anfrage:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Verarbeitung der Chat-Anfrage',
      details: error.message,
      type: error.name
    });
  }
});

module.exports = router; 