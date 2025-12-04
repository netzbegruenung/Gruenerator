const express = require('express');
const router = express.Router();
const { processGraphRequest } = require('../agents/langgraph/promptProcessor');
const { createLogger } = require('../utils/logger.js');
const log = createLogger('claude_gruene_j');


const routeHandler = async (req, res) => {
  log.debug('[claude_gruene_jugend] Request received via promptProcessor');
  await processGraphRequest('gruene_jugend', req, res);
};

router.post('/', routeHandler);

module.exports = router;