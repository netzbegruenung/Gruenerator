const express = require('express');
const router = express.Router();

// Simple test route for AWS Bedrock integration
router.post('/test-bedrock', async (req, res, next) => {
  const { aiWorkerPool } = req.app.locals; // Get the pool from app context
  
  if (!aiWorkerPool) {
    return res.status(500).json({ error: 'AI Worker Pool not available' });
  }

  const testMessages = [
    { role: 'user', content: req.body.prompt || 'Hallo Claude via AWS Bedrock! Erzaehl einen kurzen Witz.' }
  ];

  const requestData = {
    type: 'bedrock-test', // Simple identifier for the type of request
    messages: testMessages,
    options: {
      useBedrock: true, // Explicitly trigger the Bedrock path in aiWorker
      max_tokens: 100
    }
    // Add systemPrompt here if needed for testing
    // systemPrompt: "Du bist ein Test-Assistent."
  };

  try {
    console.log(`[Route /test-bedrock] Sending test request to AI Worker Pool.`);
    const result = await aiWorkerPool.processRequest(requestData);
    console.log(`[Route /test-bedrock] Received result from pool.`);
    res.json(result);
  } catch (error) {
    console.error(`[Route /test-bedrock] Error processing Bedrock test request:`, error);
    res.status(500).json({ error: 'Failed to process Bedrock test request', details: error.message });
  }
});

module.exports = router; 