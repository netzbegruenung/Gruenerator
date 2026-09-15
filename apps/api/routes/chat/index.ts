/**
 * Chat Service Routes
 * Combined router for AI chat streaming, threads, and messages
 */

import express, { type Request, type Response } from 'express';

import {
  extractLocaleFromRequest,
  localizePlaceholders,
  type RequestWithLocale,
} from '../../services/localization/index.js';
import { getParam } from '../../utils/params.js';

import { getAgent, loadAgents, getDefaultAgentId } from './agents/agentLoader.js';
import computeAssetsRouter from './computeAssetsController.js';
import confirmRouter from './confirmController.js';
import feedbackRouter from './feedbackController.js';
import messagesRouter from './messagesController.js';
import notebookStreamRouter from './notebookStreamController.js';
import promptGeneratorRouter from './promptGeneratorController.js';
import summarizeRouter from './summarizeController.js';

const router = express.Router();

// NOTE: /threads is served by the ts-rest threadsContractRouter, mounted ahead
// of this router in routes.ts. The former legacy threadsController was fully
// shadowed by it and has been removed.
router.use('/messages', messagesRouter);
router.use('/notebook/stream', notebookStreamRouter);
router.use('/summarize', summarizeRouter);
router.use('/generate-system-prompt', promptGeneratorRouter);
router.use('/confirm', confirmRouter);
router.use('/compute-assets', computeAssetsRouter);
router.use('/feedback', feedbackRouter);

router.get('/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const agents = await loadAgents();
    const defaultId = getDefaultAgentId();
    const locale = extractLocaleFromRequest(req as unknown as RequestWithLocale);
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

router.get('/agents/:identifier', async (req: Request, res: Response): Promise<void> => {
  try {
    const identifier = getParam(req.params, 'identifier');
    const agent = await getAgent(identifier);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    const locale = extractLocaleFromRequest(req as unknown as RequestWithLocale);
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
