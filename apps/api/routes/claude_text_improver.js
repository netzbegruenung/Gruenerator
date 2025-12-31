const express = require('express');
const { processGraphRequest } = require('../agents/langgraph/promptProcessor');
const { createLogger } = require('../utils/logger.js');
const log = createLogger('text_improver');

const router = express.Router();

router.post('/', async (req, res) => {
  log.debug('[claude_text_improver] Request received');
  await processGraphRequest('text_improver', req, res);
});

module.exports = router;
