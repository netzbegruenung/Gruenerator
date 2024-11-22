const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { idee, details, gliederung, useBackupProvider } = req.body;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'antrag',
      systemPrompt: 'Du bist Kommunalpolitiker einer Gliederung von Bündnis 90/Die Grünen. Der User gibt dir Idee sowie Details und Gliederungsname. Entwirf einen Antrag für deine Kommune.',
      messages: [{
        role: "user",
        content: `Idee: ${idee}, Details: ${details}, Gliederungsname: ${gliederung}`
      }],
      options: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.3
      },
      useBackupProvider
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    res.json({ 
      content: result.content,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Fehler bei der Antragserstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung des Antrags',
      details: error.message 
    });
  }
});

module.exports = router;
