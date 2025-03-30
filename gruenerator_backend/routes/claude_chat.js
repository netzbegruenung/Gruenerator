const express = require('express');
const router = express.Router();
const { tavilyService } = require('../utils/searchUtils');

router.post('/', async (req, res) => {
  const { message, currentText, selectedText, chatHistory, mode = 'edit' } = req.body;

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
    // Wenn im Search-Modus, führe Tavily-Suche durch
    if (mode === 'search') {
      try {
        const searchResults = await tavilyService.search(message, {
          includeAnswer: "advanced"
        });

        // Erstelle ein Array von Nachrichten
        const messages = [];

        // Füge die Advanced Answer hinzu, wenn vorhanden
        if (searchResults.answer) {
          messages.push({
            type: 'answer',
            content: searchResults.answer
          });
        }

        // Füge die Links als separate Nachrichten hinzu
        if (searchResults.results) {
          searchResults.results.forEach(result => {
            messages.push({
              type: 'link',
              title: result.title,
              url: result.url
            });
          });
        }

        return res.json({
          responseType: 'searchResults',
          messages: messages
        });
      } catch (searchError) {
        throw new Error(`Fehler bei der Suche: ${searchError.message}`);
      }
    }

    // Nur selectedText für den Prompt verwenden, wenn es wirklich existiert
    const isSelectedMode = selectedText !== undefined && selectedText !== null && selectedText.trim().length > 0;
    
    // Unterschiedliche Prompts für Edit- und Think-Modus
    let systemPrompt, userPrompt;
    
    if (mode === 'think') {
      systemPrompt = "Du bist ein hilfreicher Assistent von Bündnis 90/Die Grünen, der Nutzern Feedback, Tipps und Hilfreiche Anmerkungen zu ihrem Text gibt.";
      userPrompt = isSelectedMode ? 
        `${chatHistory ? 'Bisherige Konversation:\n' + chatHistory + '\n\n' : ''}Hier ist der aktuelle Text: "${currentText}"
        
        Du hast diesen Abschnitt markiert: "${selectedText}"

        Nutzer*innen-Frage: ${message}

        Gib eine hilfreiche und konstruktive Antwort. Verwende gendergerechte Sprache und gib bei guten Ideen positives Feedback. Wichtig: Deine Antwort darf maximal 1.000 Zeichen lang sein.` :
        `${chatHistory ? 'Bisherige Konversation:\n' + chatHistory + '\n\n' : ''}Hier ist der Text: "${currentText}"

        Nutzer*innen-Frage: ${message}

        Gib eine hilfreiche und konstruktive Antwort direkt an die fragende Person. Verwende die Du-Form, gendergerechte Sprache und gib bei guten Ideen positives Feedback. Formuliere deine Antwort ohne Markdown, in einfachem Text. Behalte dabei die grünen Werte im Blick. Wichtig: Deine Antwort darf maximal 1.000 Zeichen lang sein.`;
    } else {
      // Standard-Edit-Modus
      systemPrompt = "Du bist ein präziser Textbearbeitungs-Assistent von Bündnis 90/Die Grünen.";
      userPrompt = isSelectedMode ? 
        `${chatHistory ? 'Bisherige Konversation:\n' + chatHistory + '\n\n' : ''}Hier ist der aktuelle Text: "${currentText}"
        
        Zu bearbeitender Abschnitt: "${selectedText}"

        Änderungswunsch von Nutzer*in: ${message}

        Bearbeite den Text im Sinne grüner Werte und gendergerechter Sprache. 
        Wichtig: Deine Antwort darf maximal 1.000 Zeichen lang sein.

        Antworte im vorgegebenen JSON-Format:
        {
          "response": "Erkläre die Änderungen persönlich in der Du-Form",
          "textAdjustment": {
            "type": "selected",
            "newText": "der neue Text"
          }
        }` :
        `${chatHistory ? 'Bisherige Konversation:\n' + chatHistory + '\n\n' : ''}Hier ist der Text: "${currentText}"

        Änderungswunsch von Nutzer*in: ${message}

        Bearbeite den Text im Sinne grüner Werte und gendergerechter Sprache. 
        Wichtig: Deine Antwort darf maximal 1.000 Zeichen lang sein.

        Antworte im vorgegebenen JSON-Format:
        {
          "response": "Erkläre die Änderungen persönlich in der Du-Form, ohne Markdown",
          "textAdjustment": {
            "type": "full",
            "oldText": null,
            "newText": "der neue Text"
          }
        }`;
    }

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt
        }
      ]
    });

    if (result.success) {
      try {
        // Im Think-Modus erwarten wir keinen JSON-Response
        if (mode === 'think') {
          return res.json({
            response: result.content,
            // Dummy-Werte für Kompatibilität
            textAdjustment: null
          });
        }
        
        // Im Edit-Modus wie bisher
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