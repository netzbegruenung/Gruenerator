//routes.js
const claudeRoute = require('./routes/claude/index');
const claudeSocialRoute = require('./routes/claude_social');
const claudeRedeRoute = require('./routes/claude_rede');
const claudeChatRoute = require('./routes/claude_chat');
const antragsversteherRoute = require('./routes/claude_antragsversteher');
const pdfExtractionRoute = require('./routes/pdf-text-extraction');
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
const { tusServer } = require('./routes/subtitler/services/tusService');

function setupRoutes(app) {
  app.use('/api/subtitler/upload', tusServer.handle.bind(tusServer));
  app.use('/api/claude', claudeRoute);
  app.use('/api/claude_social', claudeSocialRoute);
  app.use('/api/claude_rede', claudeRedeRoute);
  app.use('/api/claude_chat', claudeChatRoute);
  app.use('/api/antragsversteher', antragsversteherRoute);
  app.use('/api/pdf-extraction', pdfExtractionRoute);
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

  app.use('/api/subtitler', subtitlerRouter);
  app.use('/api/subtitler', subtitlerSocialRouter);
  app.use('/api/voice', voiceRouter);
  
  app.use('/api/search', searchRouter);
  app.use('/api/analyze', searchAnalysisRouter);
}

module.exports = { setupRoutes };