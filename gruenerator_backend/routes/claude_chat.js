const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { message, currentText, selectedText } = req.body;

  // Validierung mit detaillierten Fehlermeldungen
  const validationErrors = {};
  
  if (!message?.trim()) {
    validationErrors.message = 'Nachricht ist erforderlich';
  }
  if (!currentText?.trim()) {
    validationErrors.currentText = 'Text ist erforderlich';
  }
  
  // Wenn selectedText gesetzt (nicht null/undefined) aber leer ist,
  // dann ist es ein Fehler
  if (selectedText !== undefined && selectedText !== null && !selectedText?.trim()) {
    validationErrors.selectedText = 'Markierter Text ist ungültig';
  }

  // Wenn Fehler vorhanden, sende detaillierte Fehlermeldung
  if (Object.keys(validationErrors).length > 0) {
    return res.status(400).json({
      error: 'Validierungsfehler',
      details: validationErrors,
      code: 'VALIDATION_ERROR'
    });
  }

  const getTextWithContext = (text, position, contextSize = 50) => {
    const start = Math.max(0, position - contextSize);
    const end = Math.min(text.length, position + text.length + contextSize);
    return {
      beforeContext: text.slice(start, position),
      text: text.slice(position, position + text.length),
      afterContext: text.slice(position + text.length, end)
    };
  };

  const analyzePunctuation = (text) => {
    const startsWithPunctuation = /^[.!?•\-,]/.test(text);
    const endsWithPunctuation = /[.!?•\-,]$/.test(text);
    const type = text.startsWith('•') ? 'bullet' : 
                text.includes('.') ? 'sentence' : 
                text.includes('\n') ? 'paragraph' : 'phrase';
    
    return { startsWithPunctuation, endsWithPunctuation, type };
  };

  try {
    // Nur selectedText für den Prompt verwenden, wenn es wirklich existiert
    const isSelectedMode = selectedText !== undefined && selectedText !== null && selectedText.trim().length > 0;
    
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt: "Du bist ein präziser Textbearbeitungs-Assistent.",
      messages: [
        {
          role: "user",
          content: isSelectedMode ? 
            `Aktueller Text: "${currentText}"
            
            Markierter Text: "${selectedText}"

            Benutzer: ${message}

            Antworte in diesem Format:
            {
              "response": "Deine kurze Erklärung was du geändert hast",
              "textAdjustment": {
                "type": "selected",
                "newText": "der neue Text der den markierten Text ersetzen soll"
              }
            }` :
            `Aktueller Text: "${currentText}"

            Benutzer: ${message}

            Antworte in diesem Format:
            {
              "response": "Deine kurze Erklärung was du geändert hast",
              "textAdjustment": {
                "type": "full",
                "oldText": null,
                "newText": "der komplette neue Text"
              }
            }`
        }
      ]
    });

    if (result.success) {
      try {
        const parsedResponse = typeof result.content === 'string' 
          ? JSON.parse(result.content.replace(/```json\n|\n```/g, '')) 
          : result.content;

        if (!parsedResponse.response || !parsedResponse.textAdjustment) {
          throw new Error('Ungültiges Antwortformat');
        }

        console.log('Claude Raw Response:', {
          responseType: typeof parsedResponse.response,
          textAdjustmentType: parsedResponse.textAdjustment.type,
          newTextLength: parsedResponse.textAdjustment.newText.length,
          selectedTextPresent: !!selectedText
        });

        const response = {
          response: parsedResponse.response,
          textAdjustment: {
            type: parsedResponse.textAdjustment.type,
            newText: parsedResponse.textAdjustment.newText,
            range: parsedResponse.textAdjustment.type === 'selected' ? {
              index: currentText.indexOf(selectedText),
              length: selectedText?.length || 0
            } : {
              index: 0,
              length: currentText.length
            },
            context: parsedResponse.textAdjustment.type === 'selected' && selectedText ? 
              getTextWithContext(currentText, currentText.indexOf(selectedText)) :
              { beforeContext: '', text: currentText, afterContext: '' },
            punctuation: analyzePunctuation(parsedResponse.textAdjustment.type === 'selected' && selectedText ? 
              selectedText : currentText)
          },
          fullText: currentText
        };

        console.log('Claude Antwort:', response);
        res.json(response);
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