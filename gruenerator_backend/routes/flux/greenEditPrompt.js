const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { default: FluxImageService } = require('../../services/fluxImageService.mjs');
const ImageGenerationCounter = require('../../utils/imageGenerationCounter.js');
const redisClient = require('../../utils/redisClient.js');
const { requireAuth } = require('../../middleware/authMiddleware.js');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const imageCounter = new ImageGenerationCounter(redisClient);

function buildGreenEditPromptOriginal(userText) {
  const trimmed = (userText || '').toString().trim();
  return [
    'Edit the provided street-level photo to make the place more ecological, green, and pleasant to live in, while preserving realism.',
    '',
    'Preserve:',
    '- Original architecture, facades, skyline, street layout, curb lines, and road width',
    '- Camera angle, framing, composition, perspective, lighting, and color temperature',
    '- Existing people, vehicles, storefronts, and signage (do not change text) unless explicitly requested',
    '',
    'Apply exactly this user request (interpret and implement coherently across the scene):',
    `"${trimmed}"`,
    '',
    'Green retrofit guidelines (apply where relevant to the user request):',
    '- Trees: native street trees placed in permeable strips or tree pits along curbs; realistic spacing (6–10 m); avoid blocking entrances/signage',
    '- Plants/groundcover: native, low‑maintenance perennials and grasses in planters/green strips; add pollinator‑friendly flowers; consider rain gardens where plausible',
    '- Seating: comfortable benches (some with backrests/armrests) in durable materials; place near shade and pedestrian flows; add paired waste/recycling bins',
    '- Bicycle lanes: protected lanes with physical separators (curbs/bollards); use green paint; realistic widths (1.6–2.0 m per direction) with buffer (0.5–0.8 m)',
    '- Pedestrian improvements: wider clear sidewalks, raised crosswalks at intersections, tactile paving at ramps',
    '- Mobility calming: reduce car dominance (remove/limit curb parking if needed), prioritize walking and cycling, slow‑traffic design',
    '- Accessibility: step‑free routes, curb cuts, minimum 2 m clear sidewalk, accessible seating options',
    '- Lighting & materials: warm, energy‑efficient lighting; durable, repairable street furniture; natural palettes (greens, wood, stone)',
    '',
    'Quality and constraints:',
    '- Photorealistic edit consistent with the original: match textures, materials, shadows, and light direction',
    '- True‑to‑scale integration; no artifacts, duplication, or fantasy elements',
    '- Only add/modify what aligns with the user request and green retrofit intent; keep all other aspects unchanged'
  ].join('\n');
}

function buildGreenEditPrompt(userText, isPrecision = false) {
  const trimmed = (userText || '').toString().trim();
  const hasUserInput = trimmed.length > 0;

  if (isPrecision && hasUserInput) {
    return [
      'Edit this street photo according to the specific user instructions while maintaining photorealistic quality.',
      '',
      'Follow these user instructions exactly:',
      `"${trimmed}"`,
      '',
      'Implementation guidelines:',
      '- Execute the user\'s specific requests with precise spatial placement',
      '- Maintain original architecture, facades, lighting, and overall composition',
      '- Ensure all additions look natural and realistic for the environment',
      '- Preserve existing people, vehicles, and signage unless specifically requested to modify',
      '- Match textures, materials, shadows, and lighting conditions of the original photo',
      '- Scale and proportion all new elements appropriately to the scene'
    ].join('\n');
  }

  let prompt = `Edit this street photo to make it more ecological and pleasant while preserving the original architecture and composition.

Add green infrastructure where relevant: trees, plants, bike lanes, pedestrian improvements, sustainable materials.
Keep unchanged: buildings, perspective, lighting, people, vehicles, signage.`;

  if (hasUserInput) {
    prompt += `

Optional user guidance: "${trimmed}"`;
  }

  return prompt;
}

function buildAllyMakerPrompt(placementText, isPrecision = false) {
  const trimmed = (placementText || '').toString().trim();

  if (isPrecision && trimmed.length > 0) {
    return [
      'Add a rainbow flag tattoo to the person in the image following these precise instructions:',
      `"${trimmed}"`,
      '',
      'Requirements:',
      '- Keep the person exactly the same: face, hair, expression, pose, clothing, background',
      '- Only add the tattoo as specified in the instructions',
      '- Make the tattoo look natural, realistic, and professionally done',
      '- Ensure proper size, placement, and integration with the skin tone',
      '- The tattoo should not cover or obscure facial features unless specifically requested',
      '- Match lighting and shadows to make the tattoo appear naturally part of the photo'
    ].join('\n');
  }

  let prompt = `Add one small and decent rainbow flag face tattoo to the person on the image. Keep the person exactly the same - same face, same hair, same expression, same pose, same clothing, same background. Only add the tattoo. It shouldn't cover the face. Make it look natural and realistic. The user should be able to tell where it's added.`;

  if (trimmed.length > 0) {
    prompt += ` Place the tattoo on: ${trimmed}.`;
  }

  return prompt;
}

router.post('/prompt', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      console.log('[Flux Green Edit] Request rejected: User ID not found');
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check image generation limit
    const limitStatus = await imageCounter.checkLimit(userId);
    if (!limitStatus.canGenerate) {
      console.log(`[Flux Green Edit] Request rejected: User ${userId} has reached daily limit (${limitStatus.count}/${limitStatus.limit})`);
      return res.status(429).json({ 
        success: false, 
        error: 'Daily image generation limit reached',
        data: limitStatus,
        message: `You have reached your daily limit of ${limitStatus.limit} image generations. Try again tomorrow.`
      });
    }

    const userText = req.body?.text || req.body?.instruction || '';
    const isPrecision = req.body?.precision === 'true' || req.body?.precision === true;
    console.log(`[Flux Green Edit] Processing request with instruction: "${userText?.substring(0, 100)}..." (User: ${userId}, Usage: ${limitStatus.count + 1}/${limitStatus.limit}, Precision: ${isPrecision})`);

    if (!userText || userText.trim().length === 0) {
      console.log('[Flux Green Edit] Request rejected: Missing text instruction');
      return res.status(400).json({ success: false, error: 'Missing text instruction' });
    }

    if (!req.file) {
      console.log('[Flux Green Edit] Request rejected: Missing image file');
      return res.status(400).json({ success: false, error: 'Missing image file' });
    }

    console.log(`[Flux Green Edit] Processing image: ${req.file.originalname}, size: ${Math.round(req.file.size / 1024)}KB, type: ${req.file.mimetype}`);

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const baseDir = path.join(process.cwd(), 'uploads', 'flux', 'edits', today);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const originalExt = path.extname(req.file.originalname || '').toLowerCase();
    const guessedExt = req.file.mimetype === 'image/png' ? '.png' : (req.file.mimetype === 'image/jpeg' ? '.jpg' : (originalExt || '.bin'));
    const safeBase = now.toISOString().replace(/[:.]/g, '-');
    const filename = `input_${safeBase}${guessedExt}`;
    const filePath = path.join(baseDir, filename);
    fs.writeFileSync(filePath, req.file.buffer);

    const stats = fs.statSync(filePath);
    const relativePath = path.join('uploads', 'flux', 'edits', today, filename);

    const requestType = req.body?.type || 'green-edit';
    const prompt = requestType === 'ally-maker'
      ? buildAllyMakerPrompt(userText, isPrecision)
      : buildGreenEditPrompt(userText, isPrecision);

    // Edit image with FLUX (image-to-image)
    const flux = new FluxImageService();
    console.log(`[Flux Green Edit] Starting image generation with Flux Kontext Pro`);
    const { request, result, stored } = await flux.generateFromImage(prompt, req.file.buffer, req.file.mimetype, { output_format: 'jpeg', safety_tolerance: 2 });

    console.log(`[Flux Green Edit] Image generation completed successfully, output size: ${Math.round(stored.size / 1024)}KB`);
    
    // Increment usage counter after successful generation
    const incrementResult = await imageCounter.incrementCount(userId);
    console.log(`[Flux Green Edit] Updated usage counter for user ${userId}:`, incrementResult);
    
    return res.json({
      success: true,
      prompt,
      request: { id: request.id, polling_url: request.polling_url },
      result: { status: result.status, sample: result.result.sample },
      inputImage: {
        filename,
        path: filePath,
        relativePath,
        size: stats.size,
        mimetype: req.file.mimetype
      },
      image: {
        path: stored.filePath,
        relativePath: stored.relativePath,
        filename: stored.filename,
        size: stored.size,
        base64: `data:image/jpeg;base64,${stored.base64}`
      },
      mode: 'pro'
    });
  } catch (error) {
    console.error('[Flux Green Edit] Error during image generation:', error.message);
    if (error.response?.status) {
      console.error('[Flux Green Edit] API response status:', error.response.status);
      console.error('[Flux Green Edit] API response data:', error.response.data);
    }
    
    // Use enhanced error information from FluxImageService
    const statusCode = error.type === 'validation' ? 400 : 
                      error.type === 'billing' ? 402 :
                      error.retryable === false ? 400 : 500;
    
    return res.status(statusCode).json({ 
      success: false, 
      error: error.message || 'Failed to generate image',
      type: error.type || 'unknown',
      retryable: error.retryable || false,
      ...(error.type === 'network' && { hint: 'Please check your internet connection and try again' }),
      ...(error.type === 'billing' && { hint: 'Please add credits to your BFL account' }),
      ...(error.type === 'server' && { hint: 'The service is temporarily unavailable. Please try again in a few minutes' })
    });
  }
});

module.exports = router;

// --- Generation helpers and route ---

// Remove duplicate helpers in favor of service

router.post('/generate', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      console.log('[Flux Green Edit Generate] Request rejected: User ID not found');
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check image generation limit
    const limitStatus = await imageCounter.checkLimit(userId);
    if (!limitStatus.canGenerate) {
      console.log(`[Flux Green Edit Generate] Request rejected: User ${userId} has reached daily limit (${limitStatus.count}/${limitStatus.limit})`);
      return res.status(429).json({ 
        success: false, 
        error: 'Daily image generation limit reached',
        data: limitStatus,
        message: `You have reached your daily limit of ${limitStatus.limit} image generations. Try again tomorrow.`
      });
    }

    const userText = req.body?.text || req.body?.instruction || '';
    const isPrecision = req.body?.precision === 'true' || req.body?.precision === true;
    console.log(`[Flux Green Edit Generate] Processing request with instruction: "${userText?.substring(0, 100)}..." (User: ${userId}, Usage: ${limitStatus.count + 1}/${limitStatus.limit}, Precision: ${isPrecision})`);

    if (!userText || userText.trim().length === 0) {
      console.log('[Flux Green Edit Generate] Request rejected: Missing text instruction');
      return res.status(400).json({ success: false, error: 'Missing text instruction' });
    }

    // Store input image (for auditing/reference). Not used by FLUX pro endpoint.
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    let inputPath = null;
    if (req.file) {
      const inputDir = path.join(process.cwd(), 'uploads', 'flux', 'edits', today);
      fs.mkdirSync(inputDir, { recursive: true });
      const originalExt = path.extname(req.file.originalname || '').toLowerCase();
      const guessedExt = req.file.mimetype === 'image/png' ? '.png' : (req.file.mimetype === 'image/jpeg' ? '.jpg' : (originalExt || '.bin'));
      const safeBase = now.toISOString().replace(/[:.]/g, '-');
      const inputFilename = `input_${safeBase}${guessedExt}`;
      inputPath = path.join(inputDir, inputFilename);
      fs.writeFileSync(inputPath, req.file.buffer);
    }

    const requestType = req.body?.type || 'green-edit';
    const prompt = requestType === 'ally-maker'
      ? buildAllyMakerPrompt(userText, isPrecision)
      : buildGreenEditPrompt(userText, isPrecision);

    // Edit image with FLUX (image-to-image) - only if image was provided
    const flux = new FluxImageService();
    let generationResult;
    
    if (req.file) {
      generationResult = await flux.generateFromImage(prompt, req.file.buffer, req.file.mimetype, { output_format: 'jpeg', safety_tolerance: 2 });
    } else {
      // Fallback to text-to-image if no image provided
      generationResult = await flux.generateFromPrompt(prompt, { output_format: 'jpeg', safety_tolerance: 2 });
    }
    
    const { request, result, stored } = generationResult;

    console.log(`[Flux Green Edit Generate] Image generation completed successfully, output size: ${Math.round(stored.size / 1024)}KB`);
    
    // Increment usage counter after successful generation
    const incrementResult = await imageCounter.incrementCount(userId);
    console.log(`[Flux Green Edit Generate] Updated usage counter for user ${userId}:`, incrementResult);

    return res.json({
      success: true,
      prompt,
      request: { id: request.id, polling_url: request.polling_url },
      result: { status: result.status, sample: result.result.sample },
      image: {
        path: stored.filePath,
        relativePath: stored.relativePath,
        filename: stored.filename,
        size: stored.size,
        base64: `data:image/jpeg;base64,${stored.base64}`
      },
      mode: 'pro'
    });
  } catch (error) {
    console.error('[Flux Green Edit Generate] Error during image generation:', error.message);
    if (error.response?.status) {
      console.error('[Flux Green Edit Generate] API response status:', error.response.status);
      console.error('[Flux Green Edit Generate] API response data:', error.response.data);
    }
    
    // Use enhanced error information from FluxImageService
    const statusCode = error.type === 'validation' ? 400 : 
                      error.type === 'billing' ? 402 :
                      error.retryable === false ? 400 : 500;
    
    return res.status(statusCode).json({ 
      success: false, 
      error: error.message || 'Failed to generate image',
      type: error.type || 'unknown',
      retryable: error.retryable || false,
      ...(error.type === 'network' && { hint: 'Please check your internet connection and try again' }),
      ...(error.type === 'billing' && { hint: 'Please add credits to your BFL account' }),
      ...(error.type === 'server' && { hint: 'The service is temporarily unavailable. Please try again in a few minutes' })
    });
  }
});


