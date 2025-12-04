/**
 * Zitat Abyssale Route
 *
 * Combines Claude text generation with Abyssale professional template rendering.
 * Uses the unified sharepic_claude handler for text generation, then renders
 * via Abyssale API instead of local canvas.
 */

const express = require('express');
const fs = require('fs');
const router = express.Router();

const sharepicClaudeRoute = require('../sharepic_claude/sharepic_claude');
const AbyssaleApiClient = require('../../../services/abyssaleApiClient');
const abyssaleConfig = require('../../../config/abyssaleConfig');
const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('zitat_abyssale');


router.post('/', async (req, res) => {
  try {
    log.debug('[Zitat-Abyssale] Processing request with body:', req.body);

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

    log.debug('[Zitat-Abyssale] Text generation response:', textResponse);

    if (!textResponse || !textResponse.quote) {
      throw new Error('Failed to generate quote text');
    }

    // Step 2: Get design ID from config
    const designId = abyssaleConfig.getDesignId('zitat');
    if (!designId) {
      throw new Error('Abyssale design ID not configured for zitat type');
    }

    // Step 3: Map to Abyssale elements format using config
    const elementMapping = abyssaleConfig.elementMappings.zitat;
    const elements = {
      [elementMapping.quote]: {
        payload: textResponse.quote
      },
      [elementMapping.name]: {
        payload: req.body.name || ''
      }
    };

    log.debug('[Zitat-Abyssale] Generating image via Abyssale:', { designId, elements });

    // Step 4: Generate image using Abyssale directly
    const abyssaleClient = new AbyssaleApiClient();

    if (!abyssaleClient.isApiConfigured()) {
      throw new Error('Abyssale service is not configured');
    }

    const abyssaleResult = await abyssaleClient.generateImageWithDownload(designId, { elements });

    log.debug('[Zitat-Abyssale] Abyssale generation result:', abyssaleResult);

    // Step 5: Convert local image to base64 (same format as regular generation)
    const localImagePath = abyssaleResult.local?.path;

    if (!localImagePath || !fs.existsSync(localImagePath)) {
      throw new Error('Local image file not found');
    }

    const imageBuffer = fs.readFileSync(localImagePath);
    const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

    // Step 6: Return response in same format as regular generation
    const result = {
      success: true,
      quote: textResponse.quote,
      name: req.body.name || '',
      alternatives: textResponse.alternatives || [],
      image: base64Image,
      imageData: abyssaleResult
    };

    log.debug('[Zitat-Abyssale] Final response prepared');
    res.json(result);

  } catch (error) {
    log.error('[Zitat-Abyssale] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate Abyssale sharepic'
    });
  }
});

module.exports = router;
