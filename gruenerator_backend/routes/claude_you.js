const express = require('express');
const router = express.Router();

// Import der neuen Tool-Klassen
const { YouToolExecutor } = require('../utils/youToolExecutor');
const { YouConversationManager } = require('../utils/youConversationManager');

/**
 * Endpunkt für das Grünerator You Feature mit Tool Use
 * Verwendet Claude mit Tools um direkt die passenden Backend-Services aufzurufen
 */
router.post('/', async (req, res) => {
  const { prompt } = req.body;

  try {
    console.log('You-Anfrage mit Tool Use erhalten:', {
      promptLength: prompt?.length || 0,
      promptPreview: prompt?.substring(0, 50) + (prompt?.length > 50 ? '...' : '')
    });

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Fehlende Eingabedaten',
        details: 'Prompt ist erforderlich'
      });
    }

    // Initialize tool executor and conversation manager
    const toolExecutor = new YouToolExecutor();
    const conversationManager = new YouConversationManager(
      req.app.locals.aiWorkerPool, 
      toolExecutor
    );
    
    // Set request context for tool execution
    conversationManager.req = req;

    // Process the conversation with tool use
    const result = await conversationManager.processConversation(
      prompt
    );

    res.json({
      content: result.content,
      metadata: result.metadata,
      success: true
    });
    
  } catch (error) {
    console.error('Fehler bei der You-Anfrage mit Tool Use:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Verarbeitung der Anfrage',
      details: error.message
    });
  }
});

module.exports = router; 