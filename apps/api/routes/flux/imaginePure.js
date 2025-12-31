const express = require('express');
const path = require('path');
const fs = require('fs');
const { default: FluxImageService } = require('../../services/fluxImageService.mjs');
const ImageGenerationCounter = require('../../utils/imageGenerationCounter.js');
const redisClient = require('../../utils/redisClient.js');
const { requireAuth } = require('../../middleware/authMiddleware.js');
const { createLogger } = require('../../utils/logger.js');
const { addKiLabel } = require('../sharepic/sharepic_canvas/imagine_label_canvas.js');
const { ASPECT_RATIOS } = require('../../services/fluxPromptBuilder.js');

const log = createLogger('imaginePure');
const router = express.Router();
const imageCounter = new ImageGenerationCounter(redisClient);

const { buildFluxPrompt } = require('../../services/fluxPromptBuilder.js');

function buildPurePrompt(userPrompt, variant = 'illustration-pure') {
  return buildFluxPrompt({
    variant,
    subject: userPrompt
  });
}

router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      log.debug('[ImaginePure] Request rejected: User ID not found');
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const limitStatus = await imageCounter.checkLimit(userId);
    if (!limitStatus.canGenerate) {
      log.debug(`[ImaginePure] Request rejected: User ${userId} has reached daily limit`);
      return res.status(429).json({
        success: false,
        error: 'Daily image generation limit reached',
        data: limitStatus,
        message: `You have reached your daily limit of ${limitStatus.limit} image generations. Try again tomorrow.`
      });
    }

    const {
      prompt,
      variant = 'illustration-pure',
      seed
    } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'A prompt of at least 5 characters is required'
      });
    }

    const validVariants = ['illustration-pure', 'realistic-pure', 'pixel-pure', 'editorial-pure'];
    const selectedVariant = validVariants.includes(variant) ? variant : 'illustration-pure';

    log.debug(`[ImaginePure] Starting generation for user ${userId}, variant: ${selectedVariant}, prompt: "${prompt.substring(0, 50)}..."`);

    const fluxPromptResult = buildPurePrompt(prompt.trim(), selectedVariant);
    const fluxPrompt = fluxPromptResult.prompt;
    const dimensions = fluxPromptResult.dimensions;

    log.debug(`[ImaginePure] Calling FLUX API with dimensions ${dimensions.width}x${dimensions.height}`);

    const flux = new FluxImageService();
    const fluxOptions = {
      width: dimensions.width,
      height: dimensions.height,
      output_format: 'jpeg',
      safety_tolerance: 2
    };

    if (seed && Number.isInteger(seed)) {
      fluxOptions.seed = seed;
    }

    const { stored: fluxResult } = await flux.generateFromPrompt(fluxPrompt, fluxOptions);

    log.debug(`[ImaginePure] FLUX image generated, size: ${fluxResult.size} bytes`);

    const fluxImageBuffer = fs.readFileSync(fluxResult.filePath);

    const labeledBuffer = await addKiLabel(fluxImageBuffer);

    log.debug(`[ImaginePure] KI label added, final size: ${labeledBuffer.length} bytes`);

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const baseDir = path.join(process.cwd(), 'uploads', 'imagine', 'pure', today);

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const filename = `pure_${now.toISOString().replace(/[:.]/g, '-')}.png`;
    const filePath = path.join(baseDir, filename);
    fs.writeFileSync(filePath, labeledBuffer);

    await imageCounter.incrementCount(userId);
    const updatedLimitStatus = await imageCounter.checkLimit(userId);

    log.debug(`[ImaginePure] Image saved to ${filePath}, updated usage: ${updatedLimitStatus.count}/${updatedLimitStatus.limit}`);

    const base64Output = `data:image/png;base64,${labeledBuffer.toString('base64')}`;

    res.json({
      success: true,
      image: {
        base64: base64Output,
        path: filePath,
        relativePath: path.join('uploads', 'imagine', 'pure', today, filename),
        filename,
        size: labeledBuffer.length
      },
      metadata: {
        dimensions: { width: dimensions.width, height: dimensions.height },
        prompt: fluxPrompt,
        variant: selectedVariant,
        timestamp: now.toISOString()
      },
      usage: {
        count: updatedLimitStatus.count,
        remaining: updatedLimitStatus.limit - updatedLimitStatus.count,
        limit: updatedLimitStatus.limit
      }
    });

  } catch (error) {
    log.error('[ImaginePure] Error during image creation:', error.message);

    if (error.response?.status) {
      log.error('[ImaginePure] API response status:', error.response.status);
    }

    const statusCode = error.type === 'validation' ? 400 :
                       error.type === 'billing' ? 402 :
                       error.retryable === false ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to create image',
      type: error.type || 'unknown',
      retryable: error.retryable ?? true,
      ...(error.type === 'network' && { hint: 'Please check your internet connection and try again' }),
      ...(error.type === 'billing' && { hint: 'Please add credits to your BFL account' }),
      ...(error.type === 'server' && { hint: 'The service is temporarily unavailable. Please try again in a few minutes' })
    });
  }
});

module.exports = router;
