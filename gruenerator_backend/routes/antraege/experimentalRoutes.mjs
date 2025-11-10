/**
 * Experimental Interactive Antrag Generator Routes
 *
 * API endpoints for the multi-step interactive Antrag/Anfrage generation flow:
 * 1. POST /initiate - Start conversation, get initial questions
 * 2. POST /continue - Submit answers, get follow-ups or final result
 * 3. GET /status/:sessionId - Check session status and state
 */

import express from 'express';
const router = express.Router();
import { requireAuth } from '../../middleware/authMiddleware.js';
import {
  initiateInteractiveAntrag,
  continueInteractiveAntrag
} from '../../agents/langgraph/interactiveAntragGraph.mjs';
import {
  getExperimentalSession
} from '../../services/chatMemoryService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

// Request logger middleware
router.use((req, res, next) => {
  const reqId = `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  req._reqId = reqId;

  const start = Date.now();
  console.log(`[experimental][${reqId}] ${req.method} ${req.originalUrl}`);

  res.on('finish', () => {
    const elapsed = Date.now() - start;
    console.log(`[experimental][${reqId}] completed status=${res.statusCode} dur=${elapsed}ms`);
  });

  next();
});

/**
 * Middleware to check if user has interactive antrag beta feature enabled
 */
async function requireInteractiveAntragBeta(req, res, next) {
  const reqId = req._reqId || 'UNKNOWN';

  try {
    if (!req.user || !req.user.id) {
      console.warn(`[experimental][${reqId}] Beta check failed: No user in request`);
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access this feature'
      });
    }

    const db = getPostgresInstance();

    if (!db || !db.pool) {
      console.error(`[experimental][${reqId}] Database not available for beta feature check`);
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection not available'
      });
    }

    const result = await db.pool.query(
      'SELECT interactive_antrag_enabled FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (!result.rows || result.rows.length === 0) {
      console.warn(`[experimental][${reqId}] User profile not found: ${req.user.id}`);
      return res.status(404).json({
        error: 'Profile not found',
        message: 'User profile does not exist'
      });
    }

    const isEnabled = result.rows[0].interactive_antrag_enabled;

    if (!isEnabled) {
      console.log(`[experimental][${reqId}] Interactive antrag beta feature not enabled for user ${req.user.id}`);
      return res.status(403).json({
        error: 'Feature not enabled',
        message: 'Der interaktive Antrag-Modus ist für deinen Account nicht aktiviert. Bitte aktiviere das Feature im Labor-Tab deines Profils.'
      });
    }

    console.log(`[experimental][${reqId}] Interactive antrag beta feature check passed for user ${req.user.id}`);
    next();
  } catch (error) {
    console.error(`[experimental][${reqId}] Error checking beta feature:`, error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to verify beta feature access'
    });
  }
}

/**
 * POST /antraege/experimental/initiate
 *
 * Start an interactive Antrag generation session
 *
 * Body:
 * {
 *   "thema": "Klimaschutz in der Stadtplanung",
 *   "details": "Wir brauchen mehr Grünflächen und klimafreundliche Baumaterialien",
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
router.post('/initiate', requireAuth, requireInteractiveAntragBeta, async (req, res) => {
  const reqId = req._reqId || 'UNKNOWN';

  try {
    // Validate required fields
    const { thema, details, requestType } = req.body;

    if (!thema || typeof thema !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "thema" ist erforderlich und muss ein String sein'
      });
    }

    if (!details || typeof details !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "details" ist erforderlich und muss ein String sein'
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
      console.error(`[experimental][${reqId}] AI worker pool not available`);
      return res.status(503).json({
        status: 'error',
        message: 'AI-Dienst nicht verfügbar'
      });
    }

    console.log(`[experimental][${reqId}] Initiating for user ${userId}: ${requestType} - "${thema}"`);

    // Start interactive flow
    const result = await initiateInteractiveAntrag({
      userId,
      thema,
      details,
      requestType,
      locale: req.body.locale || req.user?.locale || 'de-DE',
      aiWorkerPool,
      req
    });

    if (result.status === 'error') {
      console.error(`[experimental][${reqId}] Initiate error:`, result.error);
      return res.status(500).json({
        status: 'error',
        message: result.message || 'Fehler beim Starten der interaktiven Antragserstellung',
        error: result.error
      });
    }

    console.log(`[experimental][${reqId}] Session created: ${result.sessionId}, ${result.questions?.length} questions`);

    res.json({
      status: 'success',
      sessionId: result.sessionId,
      conversationState: result.conversationState,
      questions: result.questions,
      questionRound: result.questionRound,
      metadata: result.metadata
    });

  } catch (error) {
    console.error(`[experimental][${reqId}] Unexpected error in initiate:`, error);
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
router.post('/continue', requireAuth, requireInteractiveAntragBeta, async (req, res) => {
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
      console.error(`[experimental][${reqId}] AI worker pool not available`);
      return res.status(503).json({
        status: 'error',
        message: 'AI-Dienst nicht verfügbar'
      });
    }

    console.log(`[experimental][${reqId}] Continuing session ${sessionId} for user ${userId}`);

    // Continue interactive flow
    const result = await continueInteractiveAntrag({
      userId,
      sessionId,
      answers,
      aiWorkerPool,
      req
    });

    if (result.status === 'error') {
      console.error(`[experimental][${reqId}] Continue error:`, result.error);

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
      console.log(`[experimental][${reqId}] Follow-up questions generated: ${result.questions?.length}`);
    } else if (result.status === 'completed') {
      console.log(`[experimental][${reqId}] Generation completed: ${result.finalResult?.length} chars`);
    }

    res.json(result);

  } catch (error) {
    console.error(`[experimental][${reqId}] Unexpected error in continue:`, error);
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
 *     "thema": "Klimaschutz in der Stadtplanung",
 *     "requestType": "antrag",
 *     "questionRound": 1,
 *     "questions": [...],
 *     "createdAt": 1234567890,
 *     "updatedAt": 1234567891,
 *     "expiresAt": 1234575090
 *   }
 * }
 */
router.get('/status/:sessionId', requireAuth, requireInteractiveAntragBeta, async (req, res) => {
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

    console.log(`[experimental][${reqId}] Checking status for session ${sessionId}, user ${userId}`);

    // Retrieve session from Redis
    const session = await getExperimentalSession(userId, sessionId);

    if (!session) {
      console.warn(`[experimental][${reqId}] Session not found: ${sessionId}`);
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
      thema: session.thema,
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

    console.log(`[experimental][${reqId}] Session found: ${session.conversationState}`);

    res.json({
      status: 'success',
      session: sessionData
    });

  } catch (error) {
    console.error(`[experimental][${reqId}] Unexpected error in status:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Interner Serverfehler beim Abrufen des Sitzungsstatus',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
