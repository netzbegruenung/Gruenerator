const express = require('express');
const router = express.Router();
const { processGraphRequest } = require('../agents/langgraph/promptProcessor');

const routeHandler = async (req, res) => {
  console.log('[claude_gruene_jugend] Request received via promptProcessor');
  await processGraphRequest('gruene_jugend', req, res);
};

router.post('/', routeHandler);

module.exports = router;