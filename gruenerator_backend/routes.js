const claudeRoute = require('./routes/claude');
const claudePresseRoute = require('./routes/claude_presse');
const claudeSocialRoute = require('./routes/claude_social');
const claudeRedeRoute = require('./routes/claude_rede');
const antragsversteherRoute = require('./routes/claude_antragsversteher');
const pdfExtractionRoute = require('./routes/pdf-text-extraction');
const wahlpruefsteinThueringenRoute = require('./routes/wahlpruefsteinthueringen');
const sharepicDreizeilenCanvasRoute = require('./routes/sharepic/sharepic_canvas/dreizeilen_canvas'); 
const zitatSharepicCanvasRoute = require('./routes/sharepic/sharepic_canvas/zitat_canvas');
const sharepicDreizeilenClaudeRoute = require('./routes/sharepic/sharepic_claude/dreizeilen_claude');
const zitatSharepicClaudeRoute = require('./routes/sharepic/sharepic_claude/zitat_claude');
const aiImageModificationRouter = require('./routes/sharepic/sharepic_canvas/aiImageModification');
const imageUploadRouter = require('./routes/sharepic/sharepic_canvas/imageUploadRouter');



function setupRoutes(app) {
  app.use('/api/claude', claudeRoute);
  app.use('/api/claude_presse', claudePresseRoute);
  app.use('/api/claude_social', claudeSocialRoute);
  app.use('/api/claude_rede', claudeRedeRoute);
  app.use('/api/antragsversteher', antragsversteherRoute);
  app.use('/api/pdf-extraction', pdfExtractionRoute);
  app.use('/api/wahlpruefsteinthueringen', wahlpruefsteinThueringenRoute);
  app.use('/api/dreizeilen_canvas', sharepicDreizeilenCanvasRoute); // Neue Route hinzugefügt
  app.use('/api/zitat_canvas', zitatSharepicCanvasRoute); // Neue Route hinzugefügt
  app.use('/api/dreizeilen_claude', sharepicDreizeilenClaudeRoute); // Neue Route hinzugefügt
  app.use('/api/zitat_claude', zitatSharepicClaudeRoute); // Neue Route hinzugefügt
  app.use('/api/ai-image-modification', aiImageModificationRouter);
  app.use('/api/upload', imageUploadRouter); // Neue Route für Bildupload



}

module.exports = { setupRoutes };
