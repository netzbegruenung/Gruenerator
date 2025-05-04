const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/authMiddleware');

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, antragstext } = req.body;
    
    // Validate input
    if (!title || !antragstext) {
      return res.status(400).json({ 
        error: 'Fehlende Eingabedaten',
        details: 'Titel und Antragstext sind erforderlich'
      });
    }

    console.log('[POST /api/antraege/generate-description] Anfrage erhalten:', {
      title,
      antragstextLength: antragstext.length,
    });

    // Get the AI worker pool from app locals (set in app.js)
    const aiWorkerPool = req.app.locals.aiWorkerPool;
    if (!aiWorkerPool) {
      console.error('[POST /api/antraege/generate-description] AI Worker Pool ist nicht verfügbar');
      return res.status(500).json({ error: 'AI-Service ist vorübergehend nicht verfügbar' });
    }

    // Prepare the AI request with Claude-3.5-Haiku model
    const aiRequest = {
      type: 'antrag_description',
      options: {
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 150,
        temperature: 0.3,
      },
      systemPrompt: 'Du erstellst kurze, präzise Beschreibungen für politische Anträge von Bündnis 90/Die Grünen. Fasse den Kerngedanken des Antrags in maximal 120 Zeichen zusammen.',
      messages: [
        {
          role: 'user',
          content: `Bitte erstelle eine kurze, prägnante Beschreibung (max. 120 Zeichen) für folgenden Antrag:
          
Titel: ${title}

Antragstext:
${antragstext.substring(0, 3000)}${antragstext.length > 3000 ? '...' : ''}

Die Beschreibung soll den Kerngedanken des Antrags knapp zusammenfassen und leicht verständlich sein. Bitte gib NUR die Beschreibung zurück, ohne Einleitung oder zusätzliche Erklärungen.`
        }
      ]
    };

    // Process the request through the AI worker pool
    console.log('[POST /api/antraege/generate-description] Sende Anfrage an AI Worker Pool');
    const aiResponse = await aiWorkerPool.processRequest(aiRequest);

    if (!aiResponse || !aiResponse.content) {
      throw new Error('Keine gültige Antwort vom AI-Service erhalten');
    }

    // Clean up the response (remove any quotes or extra formatting)
    let description = aiResponse.content.trim();
    // Remove quotes if present
    description = description.replace(/^["']|["']$/g, '');
    
    console.log('[POST /api/antraege/generate-description] Beschreibung generiert:', description);

    // Return the generated description
    return res.status(200).json({ 
      description,
      success: true,
      metadata: aiResponse.metadata || {} 
    });

  } catch (error) {
    console.error('[POST /api/antraege/generate-description] Fehler bei der Generierung der Beschreibung:', error);
    return res.status(500).json({ 
      error: 'Fehler bei der Generierung der Beschreibung',
      details: error.message 
    });
  }
});

module.exports = router; 