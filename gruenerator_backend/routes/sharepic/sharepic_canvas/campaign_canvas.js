const express = require('express');
const router = express.Router();
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const { FONT_PATH, PTSANS_REGULAR_PATH, PTSANS_BOLD_PATH } = require('./config');

// Register fonts
registerFont(FONT_PATH, { family: 'GrueneType' });
if (fs.existsSync(PTSANS_REGULAR_PATH)) {
  registerFont(PTSANS_REGULAR_PATH, { family: 'PTSans-Regular' });
}
if (fs.existsSync(PTSANS_BOLD_PATH)) {
  registerFont(PTSANS_BOLD_PATH, { family: 'PTSans-Bold' });
}

/**
 * Load campaign configuration from JSON file
 */
function loadCampaignConfig(campaignId, typeId) {
  if (!campaignId || !typeId) return null;

  const campaignPath = path.join(__dirname, '../../../config/campaigns', `${campaignId}.json`);

  if (!fs.existsSync(campaignPath)) {
    console.warn(`[CampaignCanvas] Config not found: ${campaignPath}`);
    return null;
  }

  try {
    const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
    const typeConfig = campaign.types?.[typeId];

    if (!typeConfig) {
      console.warn(`[CampaignCanvas] Type ${typeId} not found in campaign ${campaignId}`);
      return null;
    }

    console.log(`[CampaignCanvas] Loaded config for ${campaignId}/${typeId}`);
    return typeConfig;
  } catch (error) {
    console.error(`[CampaignCanvas] Failed to load config:`, error);
    return null;
  }
}

/**
 * Generate campaign canvas image (internal helper function)
 * @param {string} campaignId - Campaign ID
 * @param {string} campaignTypeId - Campaign type ID
 * @param {Object} textData - Text data with line1-5 fields
 * @param {string} location - Location for credit text variable substitution
 * @param {string|null} customCredit - Optional custom credit text to override default
 * @returns {Promise<string>} Base64 encoded image
 */
async function generateCampaignCanvas(campaignId, campaignTypeId, textData, location = '', customCredit = null) {
  const campaignConfig = loadCampaignConfig(campaignId, campaignTypeId);

  if (!campaignConfig) {
    throw new Error(`Campaign configuration not found: ${campaignId}/${campaignTypeId}`);
  }

  if (!campaignConfig.canvas) {
    throw new Error('Campaign canvas configuration required');
  }

  console.log('[CampaignCanvas] Rendering with config:', {
    width: campaignConfig.canvas.width,
    height: campaignConfig.canvas.height,
    textLines: campaignConfig.canvas.textLines?.length,
    decorations: campaignConfig.canvas.decorations?.length,
    hasBackground: !!campaignConfig.canvas.backgroundImage || !!campaignConfig.canvas.backgroundColor
  });

  console.log('[CampaignCanvas] Text data:', textData);

  const canvasConfig = campaignConfig.canvas;
  const canvas = createCanvas(canvasConfig.width, canvasConfig.height);
  const ctx = canvas.getContext('2d');

  // 1. Render background
  await renderBackground(ctx, canvasConfig, canvas.width, canvas.height);

  // 2. Render decorations (behind text)
  if (canvasConfig.decorations && canvasConfig.decorations.length > 0) {
    await renderDecorations(ctx, canvasConfig.decorations);
  }

  // 3. Render text lines
  if (canvasConfig.textLines) {
    renderTextLines(ctx, canvasConfig.textLines, textData);
  }

  // 4. Render credit and capture the text
  let creditText = '';
  if (canvasConfig.credit) {
    creditText = renderCredit(ctx, canvasConfig.credit, location, customCredit);
  }

  console.log('[CampaignCanvas] Returning creditText:', creditText);

  // Return base64 image and credit text
  const imageBase64 = canvas.toBuffer('image/png').toString('base64');
  return {
    image: `data:image/png;base64,${imageBase64}`,
    creditText: creditText
  };
}

/**
 * Generic campaign canvas renderer
 * Renders sharepics based on JSON configuration
 *
 * Supports two request formats:
 * 1. Internal (from chat service): { campaignConfig, textData }
 * 2. External (from Sharepicgenerator): { campaignId, campaignTypeId, line1, line2, line3, line4, line5 }
 */
router.post('/', async (req, res) => {
  try {
    let campaignConfig = req.body.campaignConfig;
    let textData = req.body.textData;

    // Extract location from request (support both 'location' and 'thema' for backward compatibility)
    const location = req.body.location || req.body.thema || '';

    // Extract optional custom credit text
    const customCredit = req.body.customCredit || null;

    // If campaignConfig not provided, load it from campaignId/campaignTypeId
    if (!campaignConfig) {
      const { campaignId, campaignTypeId } = req.body;

      console.log(`[CampaignCanvas] Loading config for ${campaignId}/${campaignTypeId}`);

      if (!campaignId || !campaignTypeId) {
        return res.status(400).json({
          success: false,
          error: 'Either campaignConfig or (campaignId + campaignTypeId) required'
        });
      }

      // Build textData from line fields
      textData = {
        line1: req.body.line1 || '',
        line2: req.body.line2 || '',
        line3: req.body.line3 || '',
        line4: req.body.line4 || '',
        line5: req.body.line5 || ''
      };

      console.log(`[CampaignCanvas] Text data from request:`, textData);

      // Use helper function
      const { image, creditText } = await generateCampaignCanvas(campaignId, campaignTypeId, textData, location, customCredit);
      return res.json({
        success: true,
        image: image,
        creditText: creditText
      });
    }

    if (!campaignConfig.canvas) {
      return res.status(400).json({
        success: false,
        error: 'Campaign canvas configuration required'
      });
    }

    console.log('[CampaignCanvas] Rendering with config:', {
      width: campaignConfig.canvas.width,
      height: campaignConfig.canvas.height,
      textLines: campaignConfig.canvas.textLines?.length,
      decorations: campaignConfig.canvas.decorations?.length,
      hasBackground: !!campaignConfig.canvas.backgroundImage || !!campaignConfig.canvas.backgroundColor
    });

    console.log('[CampaignCanvas] Text data:', textData);

    const canvasConfig = campaignConfig.canvas;
    const canvas = createCanvas(canvasConfig.width, canvasConfig.height);
    const ctx = canvas.getContext('2d');

    // 1. Render background
    await renderBackground(ctx, canvasConfig, canvas.width, canvas.height);

    // 2. Render decorations (behind text)
    if (canvasConfig.decorations && canvasConfig.decorations.length > 0) {
      await renderDecorations(ctx, canvasConfig.decorations);
    }

    // 3. Render text lines
    if (canvasConfig.textLines) {
      renderTextLines(ctx, canvasConfig.textLines, textData);
    }

    // 4. Render credit and capture the text
    let creditText = '';
    if (canvasConfig.credit) {
      creditText = renderCredit(ctx, canvasConfig.credit, location, customCredit);
    }

    // Return base64 image and credit text
    const imageBase64 = canvas.toBuffer('image/png').toString('base64');
    res.json({
      success: true,
      image: `data:image/png;base64,${imageBase64}`,
      creditText: creditText
    });

  } catch (error) {
    console.error('[CampaignCanvas] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Render background (image or solid color)
 */
async function renderBackground(ctx, config, width, height) {
  if (config.backgroundImage) {
    const bgPath = path.join(__dirname, '../../../public', config.backgroundImage);

    if (!fs.existsSync(bgPath)) {
      console.warn(`[CampaignCanvas] Background image not found: ${bgPath}`);
      // Fallback to solid color
      ctx.fillStyle = config.backgroundColor || '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    console.log(`[CampaignCanvas] Loading background image: ${bgPath}`);
    const bgImage = await loadImage(bgPath);

    // Crop to fit (same logic as existing canvas files)
    const imageAspectRatio = bgImage.width / bgImage.height;
    const canvasAspectRatio = width / height;

    let sx = 0, sy = 0, sWidth = bgImage.width, sHeight = bgImage.height;

    if (imageAspectRatio > canvasAspectRatio) {
      // Image wider than canvas - crop sides
      sWidth = bgImage.height * canvasAspectRatio;
      sx = (bgImage.width - sWidth) / 2;
    } else {
      // Image taller than canvas - crop top/bottom
      sHeight = bgImage.width / canvasAspectRatio;
      sy = (bgImage.height - sHeight) / 2;
    }

    ctx.drawImage(bgImage, sx, sy, sWidth, sHeight, 0, 0, width, height);
    console.log(`[CampaignCanvas] Background image rendered successfully`);

  } else if (config.backgroundColor) {
    console.log(`[CampaignCanvas] Using solid background color: ${config.backgroundColor}`);
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Default white background
    console.log(`[CampaignCanvas] Using default white background`);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
  }
}

/**
 * Render decorations (images, SVGs)
 */
async function renderDecorations(ctx, decorations) {
  for (const deco of decorations) {
    try {
      if (deco.type === 'image') {
        const decoPath = path.join(__dirname, '../../../public', deco.path);

        if (!fs.existsSync(decoPath)) {
          console.warn(`[CampaignCanvas] Decoration not found: ${decoPath}, skipping`);
          continue;
        }

        const decoImage = await loadImage(decoPath);

        const oldAlpha = ctx.globalAlpha;
        if (deco.opacity !== undefined) {
          ctx.globalAlpha = deco.opacity;
        }

        ctx.drawImage(decoImage, deco.x, deco.y, deco.width, deco.height);
        ctx.globalAlpha = oldAlpha;

        console.log(`[CampaignCanvas] Decoration rendered: ${deco.path}`);
      }
      // Add SVG support later if needed
    } catch (error) {
      console.warn(`[CampaignCanvas] Failed to render decoration:`, error.message);
    }
  }
}

/**
 * Render text lines
 */
function renderTextLines(ctx, textLines, textData) {
  for (const lineConfig of textLines) {
    const text = textData[lineConfig.field];

    if (!text) {
      console.warn(`[CampaignCanvas] No text data for field: ${lineConfig.field}`);
      continue;
    }

    // Set font
    const fontStyle = lineConfig.style || '';
    const font = `${fontStyle} ${lineConfig.fontSize}px ${lineConfig.font}`.trim();
    ctx.font = font;
    ctx.fillStyle = lineConfig.color;
    ctx.textAlign = lineConfig.align || 'left';

    console.log(`[CampaignCanvas] Rendering text "${text}" with font: ${font}`);

    // Handle multi-line text wrapping if maxWidth specified
    if (lineConfig.maxWidth && lineConfig.lineHeight) {
      const lines = wrapText(ctx, text, lineConfig.maxWidth);
      let currentY = lineConfig.y;

      console.log(`[CampaignCanvas] Text wrapped into ${lines.length} lines`);

      for (const line of lines) {
        ctx.fillText(line, lineConfig.x, currentY);
        currentY += lineConfig.lineHeight;
      }
    } else {
      // Single line text
      ctx.fillText(text, lineConfig.x, lineConfig.y);
    }
  }
}

/**
 * Wrap text to fit within maxWidth
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + words[i] + ' ';
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && i > 0) {
      lines.push(currentLine.trim());
      currentLine = words[i] + ' ';
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine.trim());
  return lines;
}

/**
 * Render credit text
 * @returns {string} The actual credit text that was rendered
 */
function renderCredit(ctx, creditConfig, location = '', customCredit = null) {
  ctx.font = `${creditConfig.fontSize}px ${creditConfig.font}`;
  ctx.fillStyle = creditConfig.color;
  ctx.textAlign = creditConfig.align || 'left';

  let creditText;

  // If customCredit provided, use it entirely (no template replacement)
  if (customCredit && customCredit.trim()) {
    creditText = customCredit;
  } else {
    // Use default credit from config with {{location}} replacement
    creditText = creditConfig.text;
    if (location && creditText.includes('{{location}}')) {
      creditText = creditText.replace(/\{\{location\}\}/g, location);
    }
  }

  ctx.fillText(creditText, creditConfig.x, creditConfig.y);
  console.log(`[CampaignCanvas] Credit rendered: ${creditText}`);

  return creditText;
}

module.exports = router;
module.exports.generateCampaignCanvas = generateCampaignCanvas;
