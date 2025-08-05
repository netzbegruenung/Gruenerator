//routes.js
const antraegeRouter = require('./routes/antraege/index'); // Import the consolidated Anträge router
// const saveAntragRoute = require('./routes/antraege/saveAntrag');
// const getMyAntraegeRouter = require('./routes/antraege/getMyAntraege');
// const deleteAntragRouter = require('./routes/antraege/deleteAntrag');
// const antragSimpleRoute = require('./routes/antraege/antrag_simple'); // REMOVED direct import/use
// claude_social will be imported dynamically (ES6 module)
const claudeChatRoute = require('./routes/claude_chat');
const { universalRouter, redeRouter, wahlprogrammRouter } = require('./routes/claude_universal');
const antragsversteherRoute = require('./routes/claude_antragsversteher');
const wahlpruefsteinBundestagswahlRoute = require('./routes/wahlpruefsteinbundestagswahl');
const sharepicDreizeilenCanvasRoute = require('./routes/sharepic/sharepic_canvas/dreizeilen_canvas');
const zitatSharepicCanvasRoute = require('./routes/sharepic/sharepic_canvas/zitat_canvas');
const zitatPureSharepicCanvasRoute = require('./routes/sharepic/sharepic_canvas/zitat_pure_canvas');
const headlineSharepicCanvasRoute = require('./routes/sharepic/sharepic_canvas/headline_canvas');
const infoSharepicCanvasRoute = require('./routes/sharepic/sharepic_canvas/info_canvas');
const sharepicClaudeRoute = require('./routes/sharepic/sharepic_claude/sharepic_claude');
const aiImageModificationRouter = require('./routes/sharepic/sharepic_canvas/aiImageModification');
const imageUploadRouter = require('./routes/sharepic/sharepic_canvas/imageUploadRouter');
const processTextRouter = require('./routes/sharepic/sharepic_canvas/processTextRouter');
const claudeTextAdjustmentRoute = require('./routes/claude_text_adjustment');
const etherpadRoute = require('./routes/etherpad/etherpadController');
const claudeKandidatRoute = require('./routes/claude_kandidat');
const claudeGrueneJugendRoute = require('./routes/claude_gruene_jugend');
const claudeYouRoute = require('./routes/claude_you');
const searchRouter = require('./routes/search/searchRoutes');
const searchAnalysisRouter = require('./routes/search/searchAnalysis');
const subtitlerRouter = require('./routes/subtitler/subtitlerController');
const subtitlerSocialRouter = require('./routes/subtitler/subtitlerSocialController');
const voiceRouter = require('./routes/voice/voiceController');
// customGeneratorRoute and generatorConfiguratorRoute will be imported as ES6 modules
// const customGeneratorRoute = require('./routes/custom_generator');
// const generatorConfiguratorRoute = require('./routes/generator_configurator');
const claudeSubtitlesRoute = require('./routes/claude_subtitles');
// claudeGrueneratorAskRoute will be imported dynamically (ES6 module)
const { tusServer } = require('./routes/subtitler/services/tusService');
const collabEditorRouter = require('./routes/collabEditor'); // Import the new collab editor route
const snapshottingRouter = require('./routes/internal/snapshottingController'); // Import the new snapshotting controller
const offboardingRouter = require('./routes/internal/offboardingController'); // Import the offboarding controller
// mem0Router will be imported dynamically like auth routes
// Auth routes will be imported dynamically


async function setupRoutes(app) {
  // Add debug middleware to trace ALL requests before anything else
  app.use('*', (req, res, next) => {
    console.log(`[SERVER REQUEST] ${req.method} ${req.originalUrl} - From: ${req.headers.origin || 'unknown'}`);
    next();
  });

  // Add debug middleware to trace all API requests
  app.use('/api/*', (req, res, next) => {
    // Only log for claude_social to avoid bloat
    if (req.originalUrl.includes('/claude_social')) {
      console.log(`[Route Debug] ${req.method} ${req.originalUrl} - Session: ${req.sessionID}`);
      console.log(`[Route Debug] Session info:`, {
        hasSession: !!req.session,
        sessionId: req.sessionID,
        hasUser: !!req.user,
        hasPassportUser: !!req.session?.passport?.user,
        passportUserId: req.session?.passport?.user?.id
      });
    }
    next();
  });

  // app.use('/api/subtitler/upload', tusServer.handle.bind(tusServer)); // REMOVED: Redundant, already handled in server.mjs

  // Auth routes (non-API path) - dynamic import for ES modules
  const { default: authCore } = await import('./routes/auth/authCore.mjs');
  const { default: userProfile } = await import('./routes/auth/userProfile.mjs');
  const { default: userContent } = await import('./routes/auth/userContent.mjs');
  const { default: userGroups } = await import('./routes/auth/userGroups.mjs');
  const { default: userTemplates } = await import('./routes/auth/userTemplates.mjs');
  const { default: mobileAuthRoutes } = await import('./routes/auth/mobile.mjs');
  const { default: documentsRouter } = await import('./routes/documents.mjs');
  const { default: bundestagRouter } = await import('./routes/bundestag.mjs');
  // Try to import mem0Router, handle gracefully if dependencies missing
  let mem0Router = null;
  try {
    const mem0Module = await import('./routes/mem0.mjs');
    mem0Router = mem0Module.default;
  } catch (error) {
    console.log('[Setup] Mem0 router import failed, skipping mem0 routes:', error.message);
  }
  
  // Import claude_social as ES6 module
  const { default: claudeSocialRoute } = await import('./routes/claude_social.js');
  // Import claude_alttext as ES6 module
  const { default: claudeAlttextRoute } = await import('./routes/claude_alttext.js');
  // Import claude_gruenerator_ask as ES6 module
  const { default: claudeGrueneratorAskRoute } = await import('./routes/claude_gruenerator_ask.js');
  // Import claude_gruenerator_ask_grundsatz as ES6 module
  const { default: claudeGrueneratorAskGrundsatzRoute } = await import('./routes/claude_gruenerator_ask_grundsatz.js');
  // Import custom generator routes as ES6 modules
  const { default: customGeneratorRoute } = await import('./routes/custom_generator.mjs');
  const { default: generatorConfiguratorRoute } = await import('./routes/generator_configurator.mjs');
  // Import Q&A routes as ES6 modules
  const { default: qaCollectionsRouter } = await import('./routes/qaCollections.mjs');
  const { default: qaInteractionRouter } = await import('./routes/qaInteraction.mjs');
  // Import Canva routes as ES6 modules
  const { default: canvaAuthRouter } = await import('./routes/canva/canvaAuth.mjs');
  const { default: canvaApiRouter } = await import('./routes/canva/canvaApi.mjs');
  // const { default: canvaWebhooksRouter } = await import('./routes/canva/canvaWebhooks.mjs'); // Optional - only needed for real-time updates
  
  // Import Abyssale routes as ES6 module
  const { default: abyssaleRouter } = await import('./routes/abyssale.mjs');
  
  app.use('/api/auth', authCore);
  app.use('/api/auth', userProfile);
  app.use('/api/auth', userContent);
  app.use('/api/auth', userGroups);
  // app.use('/api/auth', userCustomGenerators); // REMOVED - consolidated
  app.use('/api/auth', userTemplates);
  app.use('/api/auth/mobile', mobileAuthRoutes);
  app.use('/api/auth/qa-collections', qaCollectionsRouter);
  app.use('/api/auth/qa', qaInteractionRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/bundestag', bundestagRouter);

  // Import and use userTexts route (ES6 module)
  const userTextsRouter = await import('./routes/userTexts.mjs');
  app.use('/api/user-texts', userTextsRouter.default);
  
  // Use the single consolidated router for all /api/antraege paths
  app.use('/api/antraege', antraegeRouter);

  // Remove the separate app.use calls for the individual antraege routes
  // app.use('/api/antraege/my', getMyAntraegeRouter);
  // app.use('/api/antraege', deleteAntragRouter);
  // app.use('/api/antrag-save', saveAntragRoute);

  app.use('/api/claude_social', claudeSocialRoute);
  app.use('/api/claude_alttext', claudeAlttextRoute);
  app.use('/api/claude_rede', redeRouter);
  app.use('/api/claude_chat', claudeChatRoute);
  app.use('/api/antragsversteher', antragsversteherRoute);
  app.use('/api/wahlpruefsteinbundestagswahl', wahlpruefsteinBundestagswahlRoute);
  app.use('/api/dreizeilen_canvas', sharepicDreizeilenCanvasRoute);
  app.use('/api/zitat_canvas', zitatSharepicCanvasRoute);
  app.use('/api/zitat_pure_canvas', zitatPureSharepicCanvasRoute);
  app.use('/api/headline_canvas', headlineSharepicCanvasRoute);
  app.use('/api/info_canvas', infoSharepicCanvasRoute);
  app.use('/api/dreizeilen_claude', sharepicClaudeRoute);
  
  // Use unified handler for all sharepic claude routes
  app.post('/api/zitat_claude', async (req, res) => {
    await sharepicClaudeRoute.handleClaudeRequest(req, res, 'zitat');
  });

  app.post('/api/headline_claude', async (req, res) => {
    await sharepicClaudeRoute.handleClaudeRequest(req, res, 'headline');
  });

  app.post('/api/info_claude', async (req, res) => {
    await sharepicClaudeRoute.handleClaudeRequest(req, res, 'info');
  });

  app.post('/api/zitat_pure_claude', async (req, res) => {
    await sharepicClaudeRoute.handleClaudeRequest(req, res, 'zitat_pure');
  });

  // Zitat with Abyssale generation route - combines text generation + professional template
  app.post('/api/zitat_abyssale', async (req, res) => {
    try {
      console.log('[Zitat-Abyssale] Processing request with body:', req.body);
      
      // Step 1: Generate text using existing zitat handler
      const textResponse = await new Promise((resolve, reject) => {
        const mockRes = {
          json: (data) => resolve(data),
          status: (code) => ({
            json: (data) => reject(new Error(`Status ${code}: ${JSON.stringify(data)}`)),
            send: (message) => reject(new Error(`Status ${code}: ${message}`))
          })
        };
        
        sharepicClaudeRoute.handleClaudeRequest(req, mockRes, 'zitat').catch(reject);
      });
      
      console.log('[Zitat-Abyssale] Text generation response:', textResponse);
      
      if (!textResponse || !textResponse.quote) {
        throw new Error('Failed to generate quote text');
      }
      
      // Step 2: Map to Abyssale elements format
      const abyssaleData = {
        designId: 'fc939548-a4e4-426c-be66-66034d612542',
        elements: {
          text_0: {
            payload: textResponse.quote
          },
          text_1: {
            payload: req.body.name || 'Moritz Wächter'
          }
        }
      };
      
      console.log('[Zitat-Abyssale] Sending to Abyssale API:', abyssaleData);
      
      // Step 3: Generate image using Abyssale
      const axios = require('axios');
      const abyssaleResponse = await axios.post(
        `${req.protocol}://${req.get('host')}/api/abyssale/generate`,
        abyssaleData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.cookie // Forward auth cookies
          }
        }
      );
      
      console.log('[Zitat-Abyssale] Abyssale API response:', abyssaleResponse.data);
      
      if (!abyssaleResponse.data || !abyssaleResponse.data.success) {
        throw new Error('Abyssale image generation failed');
      }
      
      // Step 4: Convert local image to base64 (like regular generation)
      const fs = require('fs');
      const localImagePath = abyssaleResponse.data.data.local?.path;
      
      if (!localImagePath || !fs.existsSync(localImagePath)) {
        throw new Error('Local image file not found');
      }
      
      // Read image file and convert to base64
      const imageBuffer = fs.readFileSync(localImagePath);
      const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      
      // Step 5: Return response in same format as regular generation
      const result = {
        success: true,
        quote: textResponse.quote,
        name: req.body.name || 'Moritz Wächter',
        alternatives: textResponse.alternatives || [],
        image: base64Image, // Same format as regular generation
        imageData: abyssaleResponse.data.data // Keep for debugging if needed
      };
      
      console.log('[Zitat-Abyssale] Final response:', result);
      res.json(result);
      
    } catch (error) {
      console.error('[Zitat-Abyssale] Error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate Abyssale sharepic'
      });
    }
  });
  app.use('/api/ai-image-modification', aiImageModificationRouter);
  app.use('/api/imageupload', imageUploadRouter);
  app.use('/api/processText', processTextRouter);
  app.use('/api/claude_text_adjustment', claudeTextAdjustmentRoute);
  app.use('/api/etherpad', etherpadRoute);
  app.use('/api/claude_wahlprogramm', wahlprogrammRouter);
  app.use('/api/claude_kandidat', claudeKandidatRoute);
  app.use('/api/claude_universal', universalRouter);
  app.use('/api/claude_gruene_jugend', claudeGrueneJugendRoute);
  app.use('/api/claude_gruenerator_ask', claudeGrueneratorAskRoute);
  app.use('/api/claude_gruenerator_ask_grundsatz', claudeGrueneratorAskGrundsatzRoute);
  app.use('/api/you', claudeYouRoute);
  app.use('/api/custom_generator', customGeneratorRoute); // Public access for view operations
  app.use('/api/auth/custom_generator', customGeneratorRoute); // Authenticated access for management operations
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

  // Add Canva routes (basic functionality)
  app.use('/api/canva/auth', canvaAuthRouter);
  app.use('/api/canva', canvaApiRouter);
  // app.use('/api/canva/webhooks', canvaWebhooksRouter); // Optional - uncomment if you need real-time webhook updates
  console.log('[Setup] Canva basic routes registered');

  // Add Abyssale routes
  app.use('/api/abyssale', abyssaleRouter);
  console.log('[Setup] Abyssale routes registered');

  // Add Mem0 routes if available
  if (mem0Router) {
    app.use('/api/mem0', mem0Router);
    console.log('[Setup] Mem0 routes registered with Node.js SDK');
  } else {
    console.log('[Setup] Mem0 routes skipped - dependencies not available');
  }
}

module.exports = { setupRoutes };