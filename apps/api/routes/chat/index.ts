/**
 * Chat Service Routes
 * Combined router for AI chat streaming, threads, and messages
 */

import express from 'express';
import chatStreamRouter from './chatStreamController.js';
import threadsRouter from './threadsController.js';
import messagesRouter from './messagesController.js';
import notebookStreamRouter from './notebookStreamController.js';
import summarizeRouter from './summarizeController.js';
import { getAgent, loadAgents, getDefaultAgentId } from './agents/agentLoader.js';

const router = express.Router();

router.use('/stream', chatStreamRouter);
router.use('/threads', threadsRouter);
router.use('/messages', messagesRouter);
router.use('/notebook/stream', notebookStreamRouter);
router.use('/summarize', summarizeRouter);

router.get('/agents', async (_req, res) => {
  try {
    const agents = await loadAgents();
    const clientAgents = agents.map((agent) => ({
      identifier: agent.identifier,
      title: agent.title,
      description: agent.description,
      avatar: agent.avatar,
      backgroundColor: agent.backgroundColor,
      openingQuestions: agent.openingQuestions,
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
    res.json({
      identifier: agent.identifier,
      title: agent.title,
      description: agent.description,
      avatar: agent.avatar,
      backgroundColor: agent.backgroundColor,
      openingQuestions: agent.openingQuestions,
      openingMessage: agent.openingMessage,
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

export {
  getAgent,
  loadAgents,
  getDefaultAgentId,
};

export default router;
