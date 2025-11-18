/**
 * Experimental Interactive Sharepic Routes
 *
 * Minimal wrapper around existing sharepic generation that formats
 * the response as an interactive session for frontend compatibility
 */

import express from 'express';
const router = express.Router();
import { requireAuth } from '../../middleware/authMiddleware.js';
import {
  setExperimentalSession,
  getExperimentalSession
} from '../../services/chatMemoryService.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load prompt configurations
const prompts = {
  dreizeilen: JSON.parse(readFileSync(join(__dirname, '../../prompts/sharepic/dreizeilen.json'), 'utf8')),
  zitat: JSON.parse(readFileSync(join(__dirname, '../../prompts/sharepic/zitat.json'), 'utf8')),
  zitat_pure: JSON.parse(readFileSync(join(__dirname, '../../prompts/sharepic/zitat_pure.json'), 'utf8')),
  headline: JSON.parse(readFileSync(join(__dirname, '../../prompts/sharepic/headline.json'), 'utf8')),
  info: JSON.parse(readFileSync(join(__dirname, '../../prompts/sharepic/info.json'), 'utf8'))
};

/**
 * Helper: Call existing sharepic generation logic
 * Reuses the exact same generation logic from sharepic_claude routes
 */
async function generateSharepicWithAlternatives(type, thema, details, aiWorkerPool, req) {
  const config = prompts[type.toLowerCase()];

  if (!config) {
    throw new Error(`Unknown sharepic type: ${type}`);
  }

  // Build request template for multiple items (5 alternatives)
  const template = config.requestTemplate;
  const requestContent = template
    .replace(/\{thema\}/g, thema)
    .replace(/\{details\}/g, details || '');

  // Call AI worker
  const result = await aiWorkerPool.processRequest({
    type: `sharepic_${type.toLowerCase()}`,
    systemPrompt: config.systemRole,
    messages: [{ role: 'user', content: requestContent }],
    options: config.options
  }, req);

  if (!result.success) {
    throw new Error(result.error || 'Generation failed');
  }

  // Parse alternatives based on type
  return parseAlternatives(result.content, type);
}

/**
 * Helper: Parse AI response into structured alternatives
 */
function parseAlternatives(content, type) {
  const alternatives = [];
  const typeLower = type.toLowerCase();

  if (typeLower === 'dreizeilen' || typeLower === 'headline') {
    // Parse 3-line slogans
    const lines = content.split('\n');

    for (let i = 0; i <= lines.length - 3; i++) {
      const line1 = lines[i].trim();
      const line2 = lines[i + 1].trim();
      const line3 = lines[i + 2].trim();

      if (line1 && line2 && line3 &&
          !line1.toLowerCase().includes('suchbegriff') &&
          line1.length >= 3 && line1.length <= 35 &&
          line2.length >= 3 && line2.length <= 35 &&
          line3.length >= 3 && line3.length <= 35) {

        alternatives.push({ line1, line2, line3 });
        i += 2;

        if (alternatives.length >= 5) break;
      }
    }
  } else if (typeLower === 'zitat') {
    // Parse quotes
    const quotePattern = /"([^"]+)"\s*-\s*([^\n]+)/g;
    let match;

    while ((match = quotePattern.exec(content)) !== null && alternatives.length < 5) {
      const quote = match[1].trim();
      const name = match[2].trim();

      if (quote.length >= 10 && quote.length <= 200) {
        alternatives.push({ quote, name });
      }
    }
  } else if (typeLower === 'info') {
    // Parse info posts
    const blocks = content.split('\n\n').filter(b => b.trim());

    for (let i = 0; i <= blocks.length - 3 && alternatives.length < 5; i += 3) {
      const header = blocks[i]?.trim();
      const subheader = blocks[i + 1]?.trim();
      const body = blocks[i + 2]?.trim();

      if (header && subheader && body) {
        alternatives.push({ header, subheader, body });
      }
    }
  }

  return alternatives;
}

/**
 * Helper: Format slogan for display in question options
 */
function formatSloganForDisplay(slogan) {
  if (slogan.line1) {
    return `${slogan.line1} / ${slogan.line2} / ${slogan.line3}`;
  } else if (slogan.quote) {
    const quoteTruncated = slogan.quote.length > 60
      ? slogan.quote.substring(0, 60) + '...'
      : slogan.quote;
    return `"${quoteTruncated}" - ${slogan.name}`;
  } else if (slogan.header) {
    const subTruncated = slogan.subheader?.length > 40
      ? slogan.subheader.substring(0, 40) + '...'
      : slogan.subheader;
    return `${slogan.header} | ${subTruncated}`;
  }
  return 'Slogan';
}

/**
 * Helper: Get question text based on sharepic type
 */
function getQuestionTextForType(type) {
  const texts = {
    'Dreizeilen': 'Welcher Slogan gefällt dir am besten?',
    'Zitat': 'Welches Zitat möchtest du verwenden?',
    'Zitat_Pure': 'Welches Zitat möchtest du verwenden?',
    'Info': 'Welcher Infopost gefällt dir am besten?',
    'Headline': 'Welche Headline möchtest du verwenden?'
  };
  return texts[type] || 'Welche Option möchtest du verwenden?';
}

/**
 * POST /sharepic/experimental/initiate
 *
 * Generate sharepic alternatives and return as interactive question
 */
router.post('/initiate', requireAuth, async (req, res) => {
  const reqId = `SHAREPIC-EXP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    const { thema, details, requestType } = req.body;

    // Validate input
    if (!thema || typeof thema !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "thema" ist erforderlich'
      });
    }

    if (!requestType) {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "requestType" ist erforderlich (Dreizeilen, Zitat, Info, Headline)'
      });
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Benutzer nicht authentifiziert'
      });
    }

    const aiWorkerPool = req.app.locals.aiWorkerPool;
    if (!aiWorkerPool) {
      return res.status(503).json({
        status: 'error',
        message: 'AI-Dienst nicht verfügbar'
      });
    }

    console.log(`[${reqId}] Generating sharepic alternatives for ${requestType}: "${thema}"`);

    // Generate alternatives using existing logic
    const alternatives = await generateSharepicWithAlternatives(
      requestType,
      thema,
      details,
      aiWorkerPool,
      req
    );

    if (!alternatives || alternatives.length === 0) {
      throw new Error('Keine Alternativen generiert');
    }

    console.log(`[${reqId}] Generated ${alternatives.length} alternatives`);

    // Create session
    const sessionId = `exp_sharepic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await setExperimentalSession(userId, sessionId, {
      sessionId,
      userId,
      conversationState: 'alternatives_generated',
      thema,
      details,
      requestType,
      sharepicAlternatives: alternatives,
      questionRound: 1,
      createdAt: Date.now(),
      expiresAt: Date.now() + (2 * 60 * 60 * 1000) // 2 hours
    });

    // Format as interactive question
    const question = {
      id: 'slogan_select',
      text: getQuestionTextForType(requestType),
      type: 'selection',
      questionFormat: 'multiple_choice',
      options: alternatives.map(formatSloganForDisplay),
      optionEmojis: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'].slice(0, alternatives.length),
      allowCustom: false,
      allowMultiSelect: false
    };

    res.json({
      status: 'success',
      sessionId,
      conversationState: 'alternatives_generated',
      questions: [question],
      questionRound: 1,
      metadata: {
        alternativeCount: alternatives.length
      }
    });

  } catch (error) {
    console.error(`[${reqId}] Error in initiate:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim Generieren der Sharepic-Alternativen',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /sharepic/experimental/continue
 *
 * Return selected slogan based on user's answer
 */
router.post('/continue', requireAuth, async (req, res) => {
  const reqId = `SHAREPIC-EXP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    const { sessionId, answers } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "sessionId" ist erforderlich'
      });
    }

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({
        status: 'error',
        message: 'Feld "answers" ist erforderlich'
      });
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Benutzer nicht authentifiziert'
      });
    }

    console.log(`[${reqId}] Continuing session ${sessionId}`);

    // Retrieve session
    const session = await getExperimentalSession(userId, sessionId);

    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: 'Sitzung nicht gefunden oder abgelaufen',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Extract selected index from answers
    const selectedIndexStr = answers.slogan_select;
    const selectedIndex = parseInt(selectedIndexStr);

    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= session.sharepicAlternatives.length) {
      return res.status(400).json({
        status: 'error',
        message: `Ungültige Auswahl: Index ${selectedIndexStr}`
      });
    }

    const selectedSlogan = session.sharepicAlternatives[selectedIndex];

    console.log(`[${reqId}] User selected option ${selectedIndex}`);

    res.json({
      status: 'completed',
      sessionId,
      conversationState: 'completed',
      finalResult: selectedSlogan,
      metadata: {
        selectedIndex,
        completedAt: Date.now()
      }
    });

  } catch (error) {
    console.error(`[${reqId}] Error in continue:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim Fortsetzen der Sitzung',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
