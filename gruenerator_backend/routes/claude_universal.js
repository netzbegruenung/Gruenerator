const express = require('express');
const { processGraphRequest } = require('../agents/langgraph/promptProcessor');
const { createLogger } = require('../utils/logger.js');
const log = createLogger('claude_universa');


// Router for Universal Text Generation
const universalRouter = express.Router();

const universalHandler = async (req, res) => {
  log.debug('[claude_universal] Request received via promptProcessor');
  await processGraphRequest('universal', req, res);
};

universalRouter.post('/', universalHandler);

// Router for Rede Generation
const redeRouter = express.Router();

const redeHandler = async (req, res) => {
  log.debug('[claude_rede] Request received via promptProcessor');
  await processGraphRequest('rede', req, res);
};

redeRouter.post('/', redeHandler);

// Router for Wahlprogramm Generation
const wahlprogrammRouter = express.Router();

const wahlprogrammHandler = async (req, res) => {
  log.debug('[claude_wahlprogramm] Request received via promptProcessor');
  await processGraphRequest('wahlprogramm', req, res);
};

wahlprogrammRouter.post('/', wahlprogrammHandler);

// Router for Bürgeranfragen Generation
const buergeranfragenRouter = express.Router();

const buergeranfragenHandler = async (req, res) => {
  log.debug('[claude_buergeranfragen] Request received via promptProcessor');
  await processGraphRequest('buergeranfragen', req, res);
};

buergeranfragenRouter.post('/', buergeranfragenHandler);

module.exports = {
  universalRouter,
  redeRouter,
  wahlprogrammRouter,
  buergeranfragenRouter
};