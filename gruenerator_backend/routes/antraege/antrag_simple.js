const express = require('express');
const router = express.Router();
const { processGraphRequest } = require('../../agents/langgraph/promptProcessor');
const { createLogger } = require('../../utils/logger.js');
const log = createLogger('antrag_simple');


// Minimal request/response logger for /api/antraege/generate-simple
router.use((req, res, next) => {
  const reqId = `AS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  req._reqId = reqId;

  const start = Date.now();
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);
  const originalRedirect = res.redirect ? res.redirect.bind(res) : null;

  // Single-line incoming log
  log.debug(`[antrag_simple][${reqId}] ${req.method} ${req.originalUrl}`);

  // Track minimal response meta without logging bodies
  let redirectedTo = null;
  let detectedHtml = false;

  const markHtmlIfNeeded = (body) => {
    // Prefer content-type; fallback to tiny heuristic without storing body
    const ct = res.get('Content-Type') || '';
    if (/text\/html/i.test(ct)) {
      detectedHtml = true;
      return;
    }
    if (typeof body === 'string' && /<html|<!DOCTYPE html/i.test(body)) {
      detectedHtml = true;
    }
  };

  res.send = function (body) {
    markHtmlIfNeeded(body);
    return originalSend(body);
  };

  res.json = function (body) {
    // JSON path – no extra logging
    return originalJson(body);
  };

  if (originalRedirect) {
    res.redirect = function (url) {
      redirectedTo = url;
      return originalRedirect(url);
    };
  }

  res.on('finish', () => {
    const elapsed = Date.now() - start;
    const ct = res.get('Content-Type') || '-';
    const parts = [
      `status=${res.statusCode}`,
      `ct=${ct}`,
      `html=${detectedHtml}`,
      `dur=${elapsed}ms`,
    ];
    if (redirectedTo) parts.push(`redir=${redirectedTo}`);
    log.debug(`[antrag_simple][${reqId}] done ${parts.join(' ')}`);
  });

  next();
});

const routeHandler = async (req, res) => {
  await processGraphRequest('antrag_simple', req, res);
};

router.post('/', routeHandler);

module.exports = router;
