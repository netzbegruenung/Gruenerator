const express = require('express');
const router = express.Router();

/**
 * Vereinfachter Endpunkt zum Generieren eines Antrags ohne Websuche
 */
router.post('/', async (req, res) => {
  const { idee, details, gliederung, useBackupProvider } = req.body;

  try {
    // Logging der Anfrage
    console.log('Einfache Antrag-Anfrage erhalten:', {
      idee: idee?.substring(0, 50) + (idee?.length > 50 ? '...' : '')
    });

    // Nur idee ist erforderlich
    if (!idee) {
      return res.status(400).json({ 
        error: 'Fehlende Eingabedaten',
        details: 'Idee ist erforderlich'
      });
    }

    console.log('Sende vereinfachte Anfrage an Claude');
    
    // Vereinfachte Anfrage mit optionalen Feldern
    const prompt = `Idee: ${idee}` + 
                   (details ? `, Details: ${details}` : '') + 
                   (gliederung ? `, Gliederungsname: ${gliederung}` : '');
    
    // Vereinfachte Anfrage an Claude
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'antrag',
      systemPrompt: 'Du bist Kommunalpolitiker einer Gliederung von Bündnis 90/Die Grünen. Entwirf einen Antrag basierend auf der gegebenen Idee.',
      messages: [{
        role: "user",
        content: prompt
      }],
      options: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.3
      },
      useBackupProvider
    });

    if (!result.success) {
      console.error('Fehler bei Claude-Anfrage:', result.error);
      throw new Error(result.error);
    }
    
    res.json({ 
      content: result.content,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Fehler bei der einfachen Antragserstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung des Antrags',
      details: error.message
    });
  }
});

module.exports = router; 