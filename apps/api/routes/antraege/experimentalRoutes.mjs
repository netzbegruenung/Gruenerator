/**
 * Experimental Interactive Antrag Generator Routes
 *
 * API endpoints for the multi-step interactive Antrag/Anfrage generation flow:
 * 1. POST /initiate - Start conversation, get initial questions
 * 2. POST /continue - Submit answers, get follow-ups or final result
 * 3. GET /status/:sessionId - Check session status and state
 */

import express from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import {
  initiateInteractiveGenerator,
  continueInteractiveGenerator
} from '../../agents/langgraph/simpleInteractiveGenerator.js';
import { getExperimentalSession } from '../../services/chat/index.js';

const router = express.Router();
const log = createLogger('experimentalRoutes');

// Request logger middleware
router.use((req, res, next) => {
  const reqId = `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  req._reqId = reqId;

  const start = Date.now();
  log.debug(`[experimental][${reqId}] ${req.method} ${req.originalUrl}`);

  res.on('finish', () => {
    const elapsed = Date.now() - start;
    log.debug(`[experimental][${reqId}] completed status=${res.statusCode} dur=${elapsed}ms`);
  });

  next();
});


/**
 * POST /antraege/experimental/initiate
 *
 * Start an interactive Antrag generation session
 *
 * Body:
 * {
 *   "inhalt": "Klimaschutz in der Stadtplanung - Wir brauchen mehr Grünflächen und klimafreundliche Baumaterialien",
 *   "requestType": "antrag" | "kleine_anfrage" | "grosse_anfrage",
 *   "locale": "de-DE" | "de-AT" (optional)
 * }
 *
 * Response:
 * {
 *   "status": "success",
 *   "sessionId": "exp_1234567890_abc123",
 *   "conversationState": "questions_asked",
 *   "questions": [
 *     {
 *       "id": "q1",
 *       "text": "Welche spezifischen Aspekte sollen im Vordergrund stehen?",
 *       "type": "scope",
 *       "options": ["Grünflächen", "Baumaterialien", "Beide gleichermaßen"],
 *       "requiresText": false
 *     },
 *     ...
 *   ],
 *   "questionRound": 1,
 *   "metadata": {
 *     "searchResultsCount": 10,
 *     "questionCount": 3
 *   }
 * }
 */
router.post('/initiate', requireAuth, async (req, res) => {
  const reqId = req._reqId || 'UNKNOWN';

  try {
    // Validate required fields
    const { inhalt, requestType } = req.body;

    if (!inhalt || typeof inhalt !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "inhalt" ist erforderlich und muss ein String sein'
      });
    }

    if (!requestType || !['antrag', 'kleine_anfrage', 'grosse_anfrage'].includes(requestType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "requestType" muss "antrag", "kleine_anfrage" oder "grosse_anfrage" sein'
      });
    }

    // Get user ID from session
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Benutzer nicht authentifiziert'
      });
    }

    // Get AI worker pool
    const aiWorkerPool = req.app.locals.aiWorkerPool;
    if (!aiWorkerPool) {
      log.error(`[experimental][${reqId}] AI worker pool not available`);
      return res.status(503).json({
        status: 'error',
        message: 'AI-Dienst nicht verfügbar'
      });
    }

    log.debug(`[experimental][${reqId}][PID:${process.pid}] Initiating for user ${userId}: ${requestType}`);

    // Start interactive flow
    const result = await initiateInteractiveGenerator({
      userId,
      inhalt,
      requestType,
      generatorType: 'antrag',
      locale: req.body.locale || req.user?.locale || 'de-DE',
      aiWorkerPool,
      req
    });

    if (result.status === 'error') {
      log.error(`[experimental][${reqId}] Initiate error:`, result.error);
      return res.status(500).json({
        status: 'error',
        message: result.message || 'Fehler beim Starten der interaktiven Antragserstellung',
        error: result.error
      });
    }

    log.debug(`[experimental][${reqId}] Session created: ${result.sessionId}, ${result.questions?.length} questions`);

    res.json({
      status: 'success',
      sessionId: result.sessionId,
      conversationState: result.conversationState,
      questions: result.questions,
      questionRound: result.questionRound,
      metadata: result.metadata
    });

  } catch (error) {
    log.error(`[experimental][${reqId}] Unexpected error in initiate:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Interner Serverfehler beim Starten der interaktiven Antragserstellung',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /antraege/experimental/continue
 *
 * Continue an interactive session by submitting answers
 *
 * Body:
 * {
 *   "sessionId": "exp_1234567890_abc123",
 *   "answers": {
 *     "q1": "Beide gleichermaßen",
 *     "q2": "Gemeinderat",
 *     "q3": "Sachlich-neutral"
 *   }
 * }
 *
 * Response (follow-up):
 * {
 *   "status": "follow_up",
 *   "sessionId": "exp_1234567890_abc123",
 *   "conversationState": "follow_up_asked",
 *   "questions": [
 *     {
 *       "id": "f1",
 *       "text": "Beide Aspekte sind wichtig - welcher soll zuerst behandelt werden?",
 *       "type": "clarification",
 *       "refersTo": "q1"
 *     }
 *   ],
 *   "questionRound": 2
 * }
 *
 * Response (completed):
 * {
 *   "status": "completed",
 *   "sessionId": "exp_1234567890_abc123",
 *   "conversationState": "completed",
 *   "finalResult": "# Antrag...\n\n...",
 *   "metadata": {
 *     "completedAt": 1234567890,
 *     "duration": 45000
 *   }
 * }
 */
router.post('/continue', requireAuth, async (req, res) => {
  const reqId = req._reqId || 'UNKNOWN';

  try {
    // Validate required fields
    const { sessionId, answers } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "sessionId" ist erforderlich und muss ein String sein'
      });
    }

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "answers" ist erforderlich und muss ein Objekt sein'
      });
    }

    // Get user ID from session
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Benutzer nicht authentifiziert'
      });
    }

    // Get AI worker pool
    const aiWorkerPool = req.app.locals.aiWorkerPool;
    if (!aiWorkerPool) {
      log.error(`[experimental][${reqId}] AI worker pool not available`);
      return res.status(503).json({
        status: 'error',
        message: 'AI-Dienst nicht verfügbar'
      });
    }

    log.debug(`[experimental][${reqId}][PID:${process.pid}] Continuing session ${sessionId} for user ${userId}`);
    log.debug(`[experimental][${reqId}] Submitted answers:`, Object.keys(answers));

    // Continue interactive flow
    const result = await continueInteractiveGenerator({
      userId,
      sessionId,
      answers,
      aiWorkerPool,
      req
    });

    if (result.status === 'error') {
      log.error(`[experimental][${reqId}] Continue error:`, result.error);

      // Check if it's a session not found error
      if (result.error?.includes('not found') || result.error?.includes('expired')) {
        return res.status(404).json({
          status: 'error',
          message: 'Sitzung nicht gefunden oder abgelaufen',
          code: 'SESSION_NOT_FOUND'
        });
      }

      return res.status(500).json({
        status: 'error',
        message: result.message || 'Fehler beim Fortsetzen der interaktiven Antragserstellung',
        error: result.error
      });
    }

    if (result.status === 'follow_up') {
      log.debug(`[experimental][${reqId}] Follow-up questions generated: ${result.questions?.length}`);
    } else if (result.status === 'completed') {
      log.debug(`[experimental][${reqId}] Generation completed: ${result.finalResult?.length} chars`);
    }

    res.json(result);

  } catch (error) {
    log.error(`[experimental][${reqId}] Unexpected error in continue:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Interner Serverfehler beim Fortsetzen der interaktiven Antragserstellung',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /antraege/experimental/status/:sessionId
 *
 * Check the status of an interactive session
 *
 * Response:
 * {
 *   "status": "success",
 *   "session": {
 *     "sessionId": "exp_1234567890_abc123",
 *     "conversationState": "questions_asked" | "follow_up_asked" | "generating" | "completed" | "error",
 *     "inhalt": "Klimaschutz in der Stadtplanung - Wir brauchen mehr Grünflächen",
 *     "requestType": "antrag",
 *     "questionRound": 1,
 *     "questions": [...],
 *     "createdAt": 1234567890,
 *     "updatedAt": 1234567891,
 *     "expiresAt": 1234575090
 *   }
 * }
 */
router.get('/status/:sessionId', requireAuth, async (req, res) => {
  const reqId = req._reqId || 'UNKNOWN';

  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: 'sessionId ist erforderlich'
      });
    }

    // Get user ID from session
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Benutzer nicht authentifiziert'
      });
    }

    log.debug(`[experimental][${reqId}] Checking status for session ${sessionId}, user ${userId}`);

    // Retrieve session from Redis
    const session = await getExperimentalSession(userId, sessionId);

    if (!session) {
      log.warn(`[experimental][${reqId}] Session not found: ${sessionId}`);
      return res.status(404).json({
        status: 'error',
        message: 'Sitzung nicht gefunden oder abgelaufen',
        code: 'SESSION_NOT_FOUND'
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
      metadata: session.metadata
    };

    // Include final result if completed
    if (session.conversationState === 'completed' && session.finalResult) {
      sessionData.finalResult = session.finalResult;
    }

    log.debug(`[experimental][${reqId}] Session found: ${session.conversationState}`);

    res.json({
      status: 'success',
      session: sessionData
    });

  } catch (error) {
    log.error(`[experimental][${reqId}] Unexpected error in status:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Interner Serverfehler beim Abrufen des Sitzungsstatus',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
