/**
 * Chat Service Routes
 * Combined router for AI chat streaming, threads, and messages
 */

import express from 'express';

import {
  extractLocaleFromRequest,
  localizePlaceholders,
} from '../../services/localization/index.js';

import { getAgent, loadAgents, getDefaultAgentId } from './agents/agentLoader.js';
import chatStreamRouter from './chatStreamController.js';
import confirmRouter from './confirmController.js';
import messagesRouter from './messagesController.js';
import notebookStreamRouter from './notebookStreamController.js';
import promptGeneratorRouter from './promptGeneratorController.js';
import searchRouter from './searchController.js';
import summarizeRouter from './summarizeController.js';
import threadsRouter from './threadsController.js';

const router = express.Router();

router.use('/stream', chatStreamRouter);
router.use('/threads', threadsRouter);
router.use('/messages', messagesRouter);
router.use('/notebook/stream', notebookStreamRouter);
router.use('/summarize', summarizeRouter);
router.use('/generate-system-prompt', promptGeneratorRouter);
router.use('/confirm', confirmRouter);
router.use('/search', searchRouter);

router.get('/agents', async (req, res) => {
  try {
    const agents = await loadAgents();
    const defaultId = getDefaultAgentId();
    const locale = extractLocaleFromRequest(req);
    const clientAgents = agents
      .filter((agent) => agent.identifier !== defaultId)
      .map((agent) => ({
        identifier: agent.identifier,
        title: agent.title,
        description: localizePlaceholders(agent.description, locale),
        avatar: agent.avatar,
        backgroundColor: agent.backgroundColor,
        tags: agent.tags,
        openingMessage: localizePlaceholders(agent.openingMessage, locale),
        openingQuestions: agent.openingQuestions,
        locale: agent.locale,
        author: agent.author,
      }));
    res.json(clientAgents);
  } catch (error) {
    console.error('Error loading agents:', error);
    res.status(500).json({ error: 'Failed to load agents' });
  }
});

router.get('/agents/:identifier', async (req, res) => {
  try {
    const agent = await getAgent(req.params.identifier);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    const locale = extractLocaleFromRequest(req);
    res.json({
      identifier: agent.identifier,
      title: agent.title,
      description: localizePlaceholders(agent.description, locale),
      avatar: agent.avatar,
      backgroundColor: agent.backgroundColor,
      openingQuestions: agent.openingQuestions,
      openingMessage: localizePlaceholders(agent.openingMessage, locale),
    });
  } catch (error) {
    console.error('Error loading agent:', error);
    res.status(500).json({ error: 'Failed to load agent' });
  }
});

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'ChatService',
    timestamp: new Date().toISOString(),
    status: 'healthy',
  });
});

export { getAgent, loadAgents, getDefaultAgentId };

export default router;
