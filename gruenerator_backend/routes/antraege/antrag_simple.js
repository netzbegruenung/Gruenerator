const express = require('express');
const router = express.Router();
const { processGraphRequest } = require('../../agents/langgraph/promptProcessor');

const routeHandler = async (req, res) => {
  console.log('[antrag_simple] Request received via promptProcessor');
  await processGraphRequest('antrag_simple', req, res);
};

router.post('/', routeHandler);

module.exports = router;