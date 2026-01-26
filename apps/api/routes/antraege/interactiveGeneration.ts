/**
 * Interactive Antrag Generation Routes
 *
 * API endpoints for multi-step interactive Antrag/Anfrage generation:
 * 1. POST /initiate - Start conversation, get initial questions
 * 2. POST /continue - Submit answers, get follow-ups or final result
 * 3. GET /status/:sessionId - Check session status and state
 */

import express, { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import {
  initiateInteractiveGenerator,
  continueInteractiveGenerator,
} from '../../agents/langgraph/simpleInteractiveGenerator.js';
import { getExperimentalSession } from '../../services/chat/ChatMemoryService.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type {
  InitiateGeneratorParams,
  InitiateGeneratorResult,
  ContinueGeneratorParams,
  ContinueGeneratorResult,
  AIWorkerPool,
  QuestionAnswers,
} from '../../agents/langgraph/types/simpleInteractiveGenerator.js';

const router = express.Router();
const log = createLogger('interactiveGeneration');

/**
 * Extended request with authentication, tracking ID, and AI worker pool
 * Uses any to avoid type conflicts with Express's complex Request type
 */
interface InteractiveRequest extends Request {
  user?: AuthenticatedRequest['user'];
  _reqId?: string;
  app: any;
}

/**
 * Request body for initiating interactive generation
 */
interface InitiateRequestBody {
  inhalt: string;
  requestType: 'antrag' | 'kleine_anfrage' | 'grosse_anfrage';
  locale?: 'de-DE' | 'de-AT';
}

/**
 * Request body for continuing interactive generation
 */
interface ContinueRequestBody {
  sessionId: string;
  answers: QuestionAnswers;
}

/**
 * Request logging middleware for interactive routes
 * Tracks request lifecycle with timing information
 */
router.use((req: InteractiveRequest, res: Response, next: NextFunction) => {
  const reqId = `IG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  req._reqId = reqId;

  const start = Date.now();
  log.debug(`[interactive][${reqId}] ${req.method} ${req.originalUrl}`);

  res.on('finish', () => {
    const elapsed = Date.now() - start;
    log.debug(`[interactive][${reqId}] completed status=${res.statusCode} dur=${elapsed}ms`);
  });

  next();
});

/**
 * POST /api/antraege/experimental/initiate
 *
 * Start an interactive Antrag generation session
 *
 * @body {InitiateRequestBody}
 * @returns Session ID, questions, and conversation state
 */
router.post('/initiate', requireAuth, async (req: InteractiveRequest, res: Response) => {
  const reqId = req._reqId || 'UNKNOWN';

  try {
    const { inhalt, requestType, locale }: InitiateRequestBody = req.body;

    // Validate required fields
    if (!inhalt || typeof inhalt !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "inhalt" ist erforderlich und muss ein String sein',
      });
    }

    if (!requestType || !['antrag', 'kleine_anfrage', 'grosse_anfrage'].includes(requestType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "requestType" muss "antrag", "kleine_anfrage" oder "grosse_anfrage" sein',
      });
    }

    // Get user ID from session
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Benutzer nicht authentifiziert',
      });
    }

    // Get AI worker pool
    const aiWorkerPool = req.app.locals.aiWorkerPool;
    if (!aiWorkerPool) {
      log.error(`[interactive][${reqId}] AI worker pool not available`);
      return res.status(503).json({
        status: 'error',
        message: 'AI-Dienst nicht verfügbar',
      });
    }

    log.debug(
      `[interactive][${reqId}][PID:${process.pid}] Initiating for user ${userId}: ${requestType}`
    );

    // Start interactive flow
    const params: InitiateGeneratorParams = {
      userId,
      inhalt,
      requestType,
      generatorType: 'antrag',
      locale: locale || req.user?.locale || 'de-DE',
      aiWorkerPool,
      req,
    };

    const result: InitiateGeneratorResult = await initiateInteractiveGenerator(params);

    if (result.status === 'error') {
      log.error(`[interactive][${reqId}] Initiate error:`, result.error);
      return res.status(500).json({
        status: 'error',
        message: result.message || 'Fehler beim Starten der interaktiven Antragserstellung',
        error: result.error,
      });
    }

    log.debug(
      `[interactive][${reqId}] Session created: ${result.sessionId}, ${result.questions?.length} questions`
    );

    return res.json({
      status: 'success',
      sessionId: result.sessionId,
      conversationState: result.conversationState,
      questions: result.questions,
      questionRound: result.questionRound,
      metadata: result.metadata,
    });
  } catch (error) {
    log.error(`[interactive][${reqId}] Unexpected error in initiate:`, error);
    return res.status(500).json({
      status: 'error',
      message: 'Interner Serverfehler beim Starten der interaktiven Antragserstellung',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
    });
  }
});

/**
 * POST /api/antraege/experimental/continue
 *
 * Continue an interactive session by submitting answers
 *
 * @body {ContinueRequestBody}
 * @returns Follow-up questions or final generated result
 */
router.post('/continue', requireAuth, async (req: InteractiveRequest, res: Response) => {
  const reqId = req._reqId || 'UNKNOWN';

  try {
    const { sessionId, answers }: ContinueRequestBody = req.body;

    // Validate required fields
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "sessionId" ist erforderlich und muss ein String sein',
      });
    }

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "answers" ist erforderlich und muss ein Objekt sein',
      });
    }

    // Get user ID from session
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Benutzer nicht authentifiziert',
      });
    }

    // Get AI worker pool
    const aiWorkerPool = req.app.locals.aiWorkerPool;
    if (!aiWorkerPool) {
      log.error(`[interactive][${reqId}] AI worker pool not available`);
      return res.status(503).json({
        status: 'error',
        message: 'AI-Dienst nicht verfügbar',
      });
    }

    log.debug(
      `[interactive][${reqId}][PID:${process.pid}] Continuing session ${sessionId} for user ${userId}`
    );
    log.debug(`[interactive][${reqId}] Submitted answers:`, Object.keys(answers));

    // Continue interactive flow
    const params: ContinueGeneratorParams = {
      userId,
      sessionId,
      answers,
      aiWorkerPool,
      req,
    };

    const result: ContinueGeneratorResult = await continueInteractiveGenerator(params);

    if (result.status === 'error') {
      log.error(`[interactive][${reqId}] Continue error:`, result.error);

      // Check if it's a session not found error
      if (result.error?.includes('not found') || result.error?.includes('expired')) {
        return res.status(404).json({
          status: 'error',
          message: 'Sitzung nicht gefunden oder abgelaufen',
          code: 'SESSION_NOT_FOUND',
        });
      }

      return res.status(500).json({
        status: 'error',
        message: result.message || 'Fehler beim Fortsetzen der interaktiven Antragserstellung',
        error: result.error,
      });
    }

    if (result.status === 'completed') {
      log.debug(
        `[interactive][${reqId}] Generation completed: ${result.finalResult?.length} chars`
      );
    }

    return res.json(result);
  } catch (error) {
    log.error(`[interactive][${reqId}] Unexpected error in continue:`, error);
    return res.status(500).json({
      status: 'error',
      message: 'Interner Serverfehler beim Fortsetzen der interaktiven Antragserstellung',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
    });
  }
});

/**
 * GET /api/antraege/experimental/status/:sessionId
 *
 * Check the status of an interactive session
 *
 * @param sessionId - Session identifier
 * @returns Current session state, questions, and metadata
 */
router.get('/status/:sessionId', requireAuth, async (req: InteractiveRequest, res: Response) => {
  const reqId = req._reqId || 'UNKNOWN';

  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: 'sessionId ist erforderlich',
      });
    }

    // Get user ID from session
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Benutzer nicht authentifiziert',
      });
    }

    log.debug(`[interactive][${reqId}] Checking status for session ${sessionId}, user ${userId}`);

    // Retrieve session from Redis
    const session = await getExperimentalSession(userId, sessionId);

    if (!session) {
      log.warn(`[interactive][${reqId}] Session not found: ${sessionId}`);
      return res.status(404).json({
        status: 'error',
        message: 'Sitzung nicht gefunden oder abgelaufen',
        code: 'SESSION_NOT_FOUND',
      });
    }

    // Return session data (without sensitive information)
    const sessionData = {
      sessionId: session.sessionId,
      conversationState: session.conversationState,
      inhalt: session.inhalt,
      requestType: session.requestType,
      questionRound: session.questionRound,
      questions: session.questions,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      metadata: session.metadata,
    };

    // Include final result if completed
    if (session.conversationState === 'completed' && session.finalResult) {
      (sessionData as any).finalResult = session.finalResult;
    }

    log.debug(`[interactive][${reqId}] Session found: ${session.conversationState}`);

    return res.json({
      status: 'success',
      session: sessionData,
    });
  } catch (error) {
    log.error(`[interactive][${reqId}] Unexpected error in status:`, error);
    return res.status(500).json({
      status: 'error',
      message: 'Interner Serverfehler beim Abrufen des Sitzungsstatus',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
    });
  }
});

export default router;
