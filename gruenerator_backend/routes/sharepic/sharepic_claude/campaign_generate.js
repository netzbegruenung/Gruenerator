const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { parseResponse } = require('../../../utils/campaignResponseParser');
const { generateCampaignCanvas } = require('../sharepic_canvas/campaign_canvas');
const { validateCampaignInputsOrThrow, ValidationError } = require('../../../utils/campaignValidator');

/**
 * Load campaign configuration from JSON file
 * @param {string} campaignId - Campaign identifier
 * @param {string} typeId - Campaign type identifier
 * @returns {Object|null} Object with merged config and full campaign, or null if not found
 */
const loadCampaignConfig = (campaignId, typeId) => {
  if (!campaignId || !typeId) return null;

  const campaignPath = path.join(__dirname, '../../../config/campaigns', `${campaignId}.json`);

  if (!fs.existsSync(campaignPath)) {
    console.warn(`[Campaign] Config not found: ${campaignPath}`);
    return null;
  }

  try {
    const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
    const typeConfig = campaign.types?.[typeId];

    if (!typeConfig) {
      console.warn(`[Campaign] Type ${typeId} not found in campaign ${campaignId}`);
      return null;
    }

    // Build canvas configuration with theme-based inheritance
    let canvasConfig;

    if (typeConfig.theme && campaign.defaultCanvas && campaign.colorThemes) {
      // Use theme-based template system
      const theme = campaign.colorThemes[typeConfig.theme];

      if (!theme) {
        console.warn(`[Campaign] Theme ${typeConfig.theme} not found in campaign ${campaignId}`);
        return null;
      }

      // Deep clone defaultCanvas to avoid mutation
      canvasConfig = JSON.parse(JSON.stringify(campaign.defaultCanvas));

      // Apply theme colors to text lines
      canvasConfig.textLines = canvasConfig.textLines.map(line => ({
        ...line,
        color: theme.textColor
      }));

      // Apply theme colors to credit
      canvasConfig.credit = {
        ...canvasConfig.credit,
        color: theme.creditColor,
        y: theme.creditY
      };

      // Set unique background image
      canvasConfig.backgroundImage = typeConfig.backgroundImage;

      console.log(`[Campaign] Built canvas for ${campaignId}/${typeId} using theme '${typeConfig.theme}'`);
    } else {
      // Use explicit canvas config (backward compatible)
      canvasConfig = typeConfig.canvas;
    }

    // Merge with defaults from campaign level
    const mergedConfig = {
      prompt: typeConfig.prompt || campaign.defaultPrompt,
      responseParser: typeConfig.responseParser || campaign.defaultResponseParser,
      multiResponseParser: typeConfig.multiResponseParser || campaign.defaultMultiResponseParser,
      canvas: canvasConfig,
      basedOn: typeConfig.basedOn
    };

    console.log(`[Campaign] Loaded config for ${campaignId}/${typeId} (using ${mergedConfig.prompt === campaign.defaultPrompt ? 'default' : 'custom'} prompt)`);

    return {
      config: mergedConfig,
      campaign: campaign
    };
  } catch (error) {
    console.error(`[Campaign] Failed to load config:`, error);
    return null;
  }
};

/**
 * POST /api/campaign_generate
 * Generate campaign text content using AI
 */
router.post('/', async (req, res) => {
  try {
    const { campaignId, campaignTypeId, thema, details, count = 5, lineOverrides } = req.body;

    console.log(`[Campaign Generate] Request: ${campaignId}/${campaignTypeId}`, {
      thema,
      details,
      count,
      hasLineOverrides: !!lineOverrides
    });

    // Validate required parameters
    if (!campaignId || !campaignTypeId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: campaignId and campaignTypeId'
      });
    }

    // Load campaign configuration
    const loadedConfig = loadCampaignConfig(campaignId, campaignTypeId);
    if (!loadedConfig) {
      return res.status(404).json({
        success: false,
        error: `Campaign configuration not found: ${campaignId}/${campaignTypeId}`
      });
    }

    const { config: campaignConfig, campaign: fullCampaign } = loadedConfig;

    // Validate form inputs against campaign formValidation rules (skip if using lineOverrides)
    if (!lineOverrides) {
      try {
        const inputs = {
          location: thema,
          details: details
        };
        validateCampaignInputsOrThrow(inputs, fullCampaign);
      } catch (validationError) {
        if (validationError instanceof ValidationError) {
          console.warn(`[Campaign Generate] Validation failed for ${validationError.field}:`, validationError.message);
          return res.status(400).json({
            success: false,
            error: validationError.message,
            field: validationError.field
          });
        }
        throw validationError;
      }
    }

    // Check if lineOverrides is provided (for regeneration with edited text)
    if (lineOverrides) {
      console.log('[Campaign Generate] Using line overrides, skipping AI generation');

      // Use provided lines directly
      const textData = {
        line1: lineOverrides.line1 || '',
        line2: lineOverrides.line2 || '',
        line3: lineOverrides.line3 || '',
        line4: lineOverrides.line4 || '',
        line5: lineOverrides.line5 || ''
      };

      // Generate canvas with provided lines and optional custom credit
      const { image, creditText } = await generateCampaignCanvas(
        campaignId,
        campaignTypeId,
        textData,
        thema,
        lineOverrides.customCredit || null
      );

      // Return single sharepic
      const sharepic = {
        id: `campaign-sharepic-${Date.now()}-0-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        image: image,
        text: textData,
        type: campaignTypeId,
        variant: campaignTypeId,
        location: thema,
        line1: textData.line1,
        line2: textData.line2,
        line3: textData.line3,
        line4: textData.line4,
        line5: textData.line5,
        creditText: creditText
      };

      console.log('[Campaign Generate] Sharepic with creditText:', {
        hasCreditText: !!sharepic.creditText,
        creditText: sharepic.creditText
      });

      return res.json({
        success: true,
        sharepics: [sharepic],
        metadata: {
          generationType: 'campaign_regeneration',
          generatedCount: 1,
          campaignId,
          campaignTypeId,
          timestamp: new Date().toISOString(),
          usedLineOverrides: true
        }
      });
    }

    // Check if campaign has response parser (required for campaign types)
    if (!campaignConfig.responseParser) {
      return res.status(400).json({
        success: false,
        error: 'Campaign configuration missing responseParser'
      });
    }

    // Generate AI text using campaign prompt
    const promptConfig = campaignConfig.prompt;
    const variables = {
      location: thema,
      thema,
      details,
      count
    };

    let allPoems = [];

    // For count > 1, use multiItemTemplate and multiResponseParser for single AI call
    if (count > 1 && promptConfig.multiItemTemplate && campaignConfig.multiResponseParser) {
      console.log(`[Campaign Generate] Using multiItemTemplate to generate ${count} poems in single AI call`);

      // Use multi-item template
      let requestText = promptConfig.multiItemTemplate;

      // Replace template variables
      Object.keys(variables).forEach(key => {
        const placeholder = `{{${key}}}`;
        if (requestText.includes(placeholder)) {
          requestText = requestText.replace(
            new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            variables[key] || ''
          );
        }
      });

      console.log(`[Campaign Generate] Calling AI with multi-item prompt:`, {
        systemRole: promptConfig.systemRole.substring(0, 100) + '...',
        requestLength: requestText.length,
        expectedPoems: count
      });

      // Single AI call for multiple poems
      const aiResult = await req.app.locals.aiWorkerPool.processRequest({
        type: `campaign_${campaignTypeId}`,
        systemPrompt: promptConfig.systemRole,
        messages: [{ role: 'user', content: requestText }],
        options: promptConfig.options
      }, req);

      if (!aiResult?.content) {
        throw new Error('AI response empty or invalid');
      }

      console.log(`[Campaign Generate] Raw AI response (${aiResult.content.length} chars)`);

      // Parse multi-poem response
      allPoems = parseResponse(aiResult.content, campaignConfig.multiResponseParser);
      console.log(`[Campaign Generate] Parsed ${allPoems.length} poems from single AI response`);

    } else {
      // Fallback: single poem generation (for count=1 or if multiItemTemplate not available)
      console.log(`[Campaign Generate] Using singleItemTemplate for single poem generation`);

      let requestText = promptConfig.singleItemTemplate || promptConfig.requestTemplate;

      // Replace template variables
      Object.keys(variables).forEach(key => {
        const placeholder = `{{${key}}}`;
        if (requestText.includes(placeholder)) {
          requestText = requestText.replace(
            new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            variables[key] || ''
          );
        }
      });

      console.log(`[Campaign Generate] Calling AI with single-item prompt:`, {
        systemRole: promptConfig.systemRole.substring(0, 100) + '...',
        requestLength: requestText.length
      });

      const aiResult = await req.app.locals.aiWorkerPool.processRequest({
        type: `campaign_${campaignTypeId}`,
        systemPrompt: promptConfig.systemRole,
        messages: [{ role: 'user', content: requestText }],
        options: promptConfig.options
      }, req);

      if (!aiResult?.content) {
        throw new Error('AI response empty or invalid');
      }

      console.log(`[Campaign Generate] Raw AI response (${aiResult.content.length} chars)`);

      const mainContent = parseResponse(aiResult.content, campaignConfig.responseParser);
      console.log(`[Campaign Generate] Parsed single poem:`, mainContent);
      allPoems = [mainContent];
    }

    // Generate canvas images for all poems and return as sharepics array
    if (allPoems.length > 0) {
      console.log(`[Campaign Generate] Generating ${allPoems.length} canvas images in parallel`);

      // Generate canvas images for all poems in parallel
      const canvasPromises = allPoems.map(async (poem, index) => {
        try {
          const textData = {
            line1: poem.line1 || '',
            line2: poem.line2 || '',
            line3: poem.line3 || '',
            line4: poem.line4 || '',
            line5: poem.line5 || ''
          };

          const { image, creditText } = await generateCampaignCanvas(campaignId, campaignTypeId, textData, thema);

          return {
            id: `campaign-sharepic-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
            createdAt: new Date().toISOString(),
            image: image,
            text: poem,
            type: campaignTypeId,
            variant: campaignTypeId,
            location: thema,
            line1: poem.line1 || '',
            line2: poem.line2 || '',
            line3: poem.line3 || '',
            line4: poem.line4 || '',
            line5: poem.line5 || '',
            creditText: creditText
          };
        } catch (canvasError) {
          console.error(`[Campaign Generate] Failed to generate canvas for poem ${index}:`, canvasError.message);
          return null;
        }
      });

      const sharepics = (await Promise.all(canvasPromises)).filter(sp => sp !== null);
      console.log(`[Campaign Generate] Successfully generated ${sharepics.length} sharepics`);
      console.log('[Campaign Generate] First sharepic creditText:', sharepics[0]?.creditText);

      // Return sharepics array format
      return res.json({
        success: true,
        sharepics,
        metadata: {
          generationType: 'campaign_multi',
          generatedCount: sharepics.length,
          campaignId,
          campaignTypeId,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Return response in expected format (count = 1, backward compatible)
    res.json({
      success: true,
      mainContent,
      alternatives,
      searchTerms: [] // Campaigns don't use search terms for images
    });

  } catch (error) {
    console.error('[Campaign Generate] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate campaign text'
    });
  }
});

module.exports = router;
