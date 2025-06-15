//routes.js
const antraegeRouter = require('./routes/antraege/index'); // Import the consolidated Anträge router
// const saveAntragRoute = require('./routes/antraege/saveAntrag');
// const getMyAntraegeRouter = require('./routes/antraege/getMyAntraege');
// const deleteAntragRouter = require('./routes/antraege/deleteAntrag');
// const antragSimpleRoute = require('./routes/antraege/antrag_simple'); // REMOVED direct import/use
const claudeSocialRoute = require('./routes/claude_social');
const claudeRedeRoute = require('./routes/claude_rede');
const claudeChatRoute = require('./routes/claude_chat');
const antragsversteherRoute = require('./routes/claude_antragsversteher');
const wahlpruefsteinBundestagswahlRoute = require('./routes/wahlpruefsteinbundestagswahl');
const sharepicDreizeilenCanvasRoute = require('./routes/sharepic/sharepic_canvas/dreizeilen_canvas');
const zitatSharepicCanvasRoute = require('./routes/sharepic/sharepic_canvas/zitat_canvas');
const sharepicDreizeilenClaudeRoute = require('./routes/sharepic/sharepic_claude/dreizeilen_claude');
const zitatSharepicClaudeRoute = require('./routes/sharepic/sharepic_claude/zitat_claude');
const aiImageModificationRouter = require('./routes/sharepic/sharepic_canvas/aiImageModification');
const imageUploadRouter = require('./routes/sharepic/sharepic_canvas/imageUploadRouter');
const processTextRouter = require('./routes/sharepic/sharepic_canvas/processTextRouter');
const claudeTextAdjustmentRoute = require('./routes/claude_text_adjustment');
const etherpadRoute = require('./routes/etherpad/etherpadController');
const claudeWahlprogrammRoute = require('./routes/claude_wahlprogramm');
const claudeKandidatRoute = require('./routes/claude_kandidat');
const claudeUniversalRoute = require('./routes/claude_universal');
const claudeGrueneJugendRoute = require('./routes/claude_gruene_jugend');
const claudeYouRoute = require('./routes/claude_you');
const searchRouter = require('./routes/search/searchController');
const searchAnalysisRouter = require('./routes/search/searchAnalysis');
const subtitlerRouter = require('./routes/subtitler/subtitlerController');
const subtitlerSocialRouter = require('./routes/subtitler/subtitlerSocialController');
const voiceRouter = require('./routes/voice/voiceController');
const customGeneratorRoute = require('./routes/custom_generator');
const generatorConfiguratorRoute = require('./routes/generator_configurator');
const claudeSubtitlesRoute = require('./routes/claude_subtitles');
const { tusServer } = require('./routes/subtitler/services/tusService');
const collabEditorRouter = require('./routes/collabEditor'); // Import the new collab editor route
const snapshottingRouter = require('./routes/internal/snapshottingController'); // Import the new snapshotting controller
const offboardingRouter = require('./routes/internal/offboardingController'); // Import the offboarding controller
// Auth routes will be imported dynamically

async function setupRoutes(app) {
  // Add debug middleware to trace ALL requests before anything else
  app.use('*', (req, res, next) => {
    console.log(`[SERVER REQUEST] ${req.method} ${req.originalUrl} - From: ${req.headers.origin || 'unknown'}`);
    next();
  });

  // Add debug middleware to trace all API requests
  app.use('/api/*', (req, res, next) => {
    console.log(`[Route Debug] ${req.method} ${req.originalUrl} - Headers: ${JSON.stringify(req.headers.cookie ? { cookie: req.headers.cookie } : {})}`);
    // Session info ohne req.isAuthenticated da passport.session() nicht mehr global läuft
    console.log(`[Route Debug] Session info:`, {
      hasSession: !!req.session,
      sessionId: req.sessionID,
      hasUser: !!req.user
    });
    next();
  });

  // app.use('/api/subtitler/upload', tusServer.handle.bind(tusServer)); // REMOVED: Redundant, already handled in server.mjs

  // Auth routes (non-API path) - dynamic import for ES modules
  const { default: authCore } = await import('./routes/auth/authCore.mjs');
  const { default: userProfile } = await import('./routes/auth/userProfile.mjs');
  const { default: userContent } = await import('./routes/auth/userContent.mjs');
  
  app.use('/api/auth', authCore);
  app.use('/api/auth', userProfile);
  app.use('/api/auth', userContent);
  
  // Use the single consolidated router for all /api/antraege paths
  app.use('/api/antraege', antraegeRouter);

  // Remove the separate app.use calls for the individual antraege routes
  // app.use('/api/antraege/my', getMyAntraegeRouter);
  // app.use('/api/antraege', deleteAntragRouter);
  // app.use('/api/antrag-save', saveAntragRoute);

  app.use('/api/claude_social', claudeSocialRoute);
  app.use('/api/claude_rede', claudeRedeRoute);
  app.use('/api/claude_chat', claudeChatRoute);
  app.use('/api/antragsversteher', antragsversteherRoute);
  app.use('/api/wahlpruefsteinbundestagswahl', wahlpruefsteinBundestagswahlRoute);
  app.use('/api/dreizeilen_canvas', sharepicDreizeilenCanvasRoute);
  app.use('/api/zitat_canvas', zitatSharepicCanvasRoute);
  app.use('/api/dreizeilen_claude', sharepicDreizeilenClaudeRoute);
  app.use('/api/zitat_claude', zitatSharepicClaudeRoute);
  app.use('/api/ai-image-modification', aiImageModificationRouter);
  app.use('/api/imageupload', imageUploadRouter);
  app.use('/api/processText', processTextRouter);
  app.use('/api/claude_text_adjustment', claudeTextAdjustmentRoute);
  app.use('/api/etherpad', etherpadRoute);
  app.use('/api/claude_wahlprogramm', claudeWahlprogrammRoute);
  app.use('/api/claude_kandidat', claudeKandidatRoute);
  app.use('/api/claude_universal', claudeUniversalRoute);
  app.use('/api/claude_gruene_jugend', claudeGrueneJugendRoute);
  app.use('/api/you', claudeYouRoute);
  app.use('/api/custom_generator', customGeneratorRoute);
  app.use('/api/generate_generator_config', generatorConfiguratorRoute);
  app.use('/api/claude/generate-short-subtitles', claudeSubtitlesRoute);

  app.use('/api/subtitler', subtitlerRouter);
  app.use('/api/subtitler', subtitlerSocialRouter);
  app.use('/api/voice', voiceRouter);

  app.use('/api/search', searchRouter);
  app.use('/api/analyze', searchAnalysisRouter);

  // Add the Collab Editor route
  app.use('/api/collab-editor', collabEditorRouter);

  // Add internal routes like snapshotting trigger
  app.use('/api/internal', snapshottingRouter);
  app.use('/api/internal/offboarding', offboardingRouter);
}

module.exports = { setupRoutes };