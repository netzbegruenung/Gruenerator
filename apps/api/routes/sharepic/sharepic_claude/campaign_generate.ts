import { Router, Request, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import {
  parseResponse,
  type ParserConfig,
  type ParsedResponse,
} from '../../../utils/campaign/responseParser.js';
import { generateCampaignCanvas } from '../sharepic_canvas/campaign_canvas.js';
import {
  validateCampaignInputsOrThrow,
  ValidationError,
} from '../../../utils/campaign/validator.js';
import { createLogger } from '../../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router: Router = Router();
const log = createLogger('campaign_genera');

interface PromptConfig {
  systemRole: string;
  singleItemTemplate?: string;
  requestTemplate?: string;
  multiItemTemplate?: string;
  options?: Record<string, unknown>;
}

interface ColorTheme {
  textColor: string;
  creditColor: string;
  creditY: number;
}

interface TextLineConfig {
  field: string;
  x: number;
  y: number;
  fontSize: number;
  font: string;
  color: string;
  [key: string]: unknown;
}

interface CreditConfig {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  font: string;
  color: string;
  [key: string]: unknown;
}

interface CanvasConfig {
  width: number;
  height: number;
  backgroundImage?: string;
  backgroundColor?: string;
  textLines?: TextLineConfig[];
  credit?: CreditConfig;
  decorations?: unknown[];
}

interface TypeConfig {
  prompt?: PromptConfig;
  responseParser?: ParserConfig;
  multiResponseParser?: ParserConfig;
  canvas?: CanvasConfig;
  theme?: string;
  backgroundImage?: string;
  basedOn?: string;
}

interface Campaign {
  defaultPrompt?: PromptConfig;
  defaultResponseParser?: ParserConfig;
  defaultMultiResponseParser?: ParserConfig;
  defaultCanvas?: CanvasConfig;
  colorThemes?: Record<string, ColorTheme>;
  types?: Record<string, TypeConfig>;
  formValidation?: Record<string, unknown>;
  textSuffix?: string;
}

interface MergedConfig {
  prompt?: PromptConfig;
  responseParser?: ParserConfig;
  multiResponseParser?: ParserConfig;
  canvas?: CanvasConfig;
  basedOn?: string;
}

interface LoadedCampaignConfig {
  config: MergedConfig;
  campaign: Campaign;
}

interface PoemContent {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  line5?: string;
  [key: string]: string | undefined;
}

interface LineOverrides extends PoemContent {
  customCredit?: string;
}

interface CampaignGenerateRequest extends Request {
  body: {
    campaignId: string;
    campaignTypeId: string;
    thema?: string;
    details?: string;
    count?: number;
    lineOverrides?: LineOverrides;
    generateCampaignText?: boolean;
  };
  app: Request['app'] & {
    locals: {
      aiWorkerPool: {
        processRequest(
          payload: {
            type: string;
            systemPrompt: string;
            messages: Array<{ role: string; content: string }>;
            options?: Record<string, unknown>;
          },
          req: Request
        ): Promise<{ success?: boolean; content?: string; error?: string }>;
      };
    };
  };
}

interface Sharepic {
  id: string;
  createdAt: string;
  image: string;
  text: PoemContent;
  type: string;
  variant: string;
  location?: string;
  line1: string;
  line2: string;
  line3: string;
  line4: string;
  line5: string;
  creditText: string;
}

interface CampaignGenerateResponse {
  success: boolean;
  sharepics?: Sharepic[];
  campaignText?: string;
  mainContent?: PoemContent;
  alternatives?: PoemContent[];
  searchTerms?: string[];
  metadata?: {
    generationType: string;
    generatedCount: number;
    campaignId: string;
    campaignTypeId: string;
    timestamp: string;
    usedLineOverrides?: boolean;
  };
  error?: string;
  field?: string;
}

function loadCampaignConfig(campaignId: string, typeId: string): LoadedCampaignConfig | null {
  if (!campaignId || !typeId) return null;

  const campaignPath = path.join(__dirname, '../../../config/campaigns', `${campaignId}.json`);

  if (!fs.existsSync(campaignPath)) {
    log.warn(`[Campaign] Config not found: ${campaignPath}`);
    return null;
  }

  try {
    const campaign: Campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
    const typeConfig = campaign.types?.[typeId];

    if (!typeConfig) {
      log.warn(`[Campaign] Type ${typeId} not found in campaign ${campaignId}`);
      return null;
    }

    let canvasConfig: CanvasConfig | undefined;

    if (typeConfig.theme && campaign.defaultCanvas && campaign.colorThemes) {
      const theme = campaign.colorThemes[typeConfig.theme];

      if (!theme) {
        log.warn(`[Campaign] Theme ${typeConfig.theme} not found in campaign ${campaignId}`);
        return null;
      }

      canvasConfig = JSON.parse(JSON.stringify(campaign.defaultCanvas)) as CanvasConfig;

      if (canvasConfig.textLines) {
        canvasConfig.textLines = canvasConfig.textLines.map((line) => ({
          ...line,
          color: theme.textColor,
        }));
      }

      if (canvasConfig.credit) {
        canvasConfig.credit = {
          ...canvasConfig.credit,
          color: theme.creditColor,
          y: theme.creditY,
        };
      }

      canvasConfig.backgroundImage = typeConfig.backgroundImage;

      log.debug(
        `[Campaign] Built canvas for ${campaignId}/${typeId} using theme '${typeConfig.theme}'`
      );
    } else {
      canvasConfig = typeConfig.canvas;
    }

    const mergedConfig: MergedConfig = {
      prompt: typeConfig.prompt || campaign.defaultPrompt,
      responseParser: typeConfig.responseParser || campaign.defaultResponseParser,
      multiResponseParser: typeConfig.multiResponseParser || campaign.defaultMultiResponseParser,
      canvas: canvasConfig,
      basedOn: typeConfig.basedOn,
    };

    log.debug(
      `[Campaign] Loaded config for ${campaignId}/${typeId} (using ${mergedConfig.prompt === campaign.defaultPrompt ? 'default' : 'custom'} prompt)`
    );

    return {
      config: mergedConfig,
      campaign: campaign,
    };
  } catch (error) {
    log.error(`[Campaign] Failed to load config:`, error);
    return null;
  }
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      campaignId,
      campaignTypeId,
      thema,
      details,
      count = 5,
      lineOverrides,
      generateCampaignText = false,
    } = (req as CampaignGenerateRequest).body;

    log.debug(`[Campaign Generate] Request: ${campaignId}/${campaignTypeId}`, {
      thema,
      details,
      count,
      hasLineOverrides: !!lineOverrides,
      generateCampaignText,
    });

    if (!campaignId || !campaignTypeId) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters: campaignId and campaignTypeId',
      } as CampaignGenerateResponse);
      return;
    }

    const loadedConfig = loadCampaignConfig(campaignId, campaignTypeId);
    if (!loadedConfig) {
      res.status(404).json({
        success: false,
        error: `Campaign configuration not found: ${campaignId}/${campaignTypeId}`,
      } as CampaignGenerateResponse);
      return;
    }

    const { config: campaignConfig, campaign: fullCampaign } = loadedConfig;

    if (!lineOverrides) {
      try {
        const inputs = {
          location: thema,
          details: details,
        };
        validateCampaignInputsOrThrow(inputs, fullCampaign as any);
      } catch (validationError) {
        if (validationError instanceof ValidationError) {
          log.warn(
            `[Campaign Generate] Validation failed for ${validationError.field}:`,
            validationError.message
          );
          res.status(400).json({
            success: false,
            error: validationError.message,
            field: validationError.field,
          } as CampaignGenerateResponse);
          return;
        }
        throw validationError;
      }
    }

    if (lineOverrides) {
      log.debug('[Campaign Generate] Using line overrides, skipping AI generation');

      const textData: PoemContent = {
        line1: lineOverrides.line1 || '',
        line2: lineOverrides.line2 || '',
        line3: lineOverrides.line3 || '',
        line4: lineOverrides.line4 || '',
        line5: lineOverrides.line5 || '',
      };

      const { image, creditText } = await generateCampaignCanvas(
        campaignId,
        campaignTypeId,
        textData,
        thema || '',
        lineOverrides.customCredit || null
      );

      const sharepic: Sharepic = {
        id: `campaign-sharepic-${Date.now()}-0-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        image: image,
        text: textData,
        type: campaignTypeId,
        variant: campaignTypeId,
        location: thema,
        line1: textData.line1 || '',
        line2: textData.line2 || '',
        line3: textData.line3 || '',
        line4: textData.line4 || '',
        line5: textData.line5 || '',
        creditText: creditText,
      };

      log.debug('[Campaign Generate] Sharepic with creditText:', {
        hasCreditText: !!sharepic.creditText,
        creditText: sharepic.creditText,
      });

      res.json({
        success: true,
        sharepics: [sharepic],
        metadata: {
          generationType: 'campaign_regeneration',
          generatedCount: 1,
          campaignId,
          campaignTypeId,
          timestamp: new Date().toISOString(),
          usedLineOverrides: true,
        },
      } as CampaignGenerateResponse);
      return;
    }

    if (!campaignConfig.responseParser) {
      res.status(400).json({
        success: false,
        error: 'Campaign configuration missing responseParser',
      } as CampaignGenerateResponse);
      return;
    }

    const promptConfig = campaignConfig.prompt;
    if (!promptConfig) {
      res.status(400).json({
        success: false,
        error: 'Campaign configuration missing prompt',
      } as CampaignGenerateResponse);
      return;
    }

    const variables: Record<string, unknown> = {
      location: thema,
      thema,
      details,
      count,
    };

    let allPoems: PoemContent[] = [];
    let campaignText: string | null = null;

    const aiReq = req as CampaignGenerateRequest;

    if (count > 1 && promptConfig.multiItemTemplate && campaignConfig.multiResponseParser) {
      log.debug(
        `[Campaign Generate] Using multiItemTemplate to generate ${count} poems in single AI call`
      );

      let requestText = promptConfig.multiItemTemplate;

      if (generateCampaignText && fullCampaign.textSuffix) {
        requestText += fullCampaign.textSuffix;
        log.debug('[Campaign Generate] Added campaign text suffix to prompt');
      }

      Object.keys(variables).forEach((key) => {
        const placeholder = `{{${key}}}`;
        if (requestText.includes(placeholder)) {
          requestText = requestText.replace(
            new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            String(variables[key] || '')
          );
        }
      });

      log.debug(`[Campaign Generate] Calling AI with multi-item prompt:`, {
        systemRole: promptConfig.systemRole.substring(0, 100) + '...',
        requestLength: requestText.length,
        expectedPoems: count,
      });

      const aiResult = await aiReq.app.locals.aiWorkerPool.processRequest(
        {
          type: `campaign_${campaignTypeId}`,
          systemPrompt: promptConfig.systemRole,
          messages: [{ role: 'user', content: requestText }],
          options: promptConfig.options,
        },
        req
      );

      if (!aiResult?.content) {
        throw new Error('AI response empty or invalid');
      }

      log.debug(`[Campaign Generate] Raw AI response (${aiResult.content.length} chars)`);

      let contentForParsing = aiResult.content;

      if (generateCampaignText) {
        const textMatch = aiResult.content.match(/---TEXT---\s*([\s\S]+?)(?:\n---|\n*$)/);
        if (textMatch) {
          campaignText = textMatch[1].trim();
          log.debug(`[Campaign Generate] Extracted campaign text (${campaignText!.length} chars)`);
          contentForParsing = aiResult.content.replace(/---TEXT---[\s\S]+$/, '').trim();
        } else {
          log.warn('[Campaign Generate] Campaign text requested but not found in AI response');
        }
      }

      const parsedResult = parseResponse(contentForParsing, campaignConfig.multiResponseParser);
      allPoems = Array.isArray(parsedResult)
        ? (parsedResult as PoemContent[])
        : [parsedResult as PoemContent];
      log.debug(`[Campaign Generate] Parsed ${allPoems.length} poems from single AI response`);
    } else {
      log.debug(`[Campaign Generate] Using singleItemTemplate for single poem generation`);

      let requestText = promptConfig.singleItemTemplate || promptConfig.requestTemplate || '';

      Object.keys(variables).forEach((key) => {
        const placeholder = `{{${key}}}`;
        if (requestText.includes(placeholder)) {
          requestText = requestText.replace(
            new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            String(variables[key] || '')
          );
        }
      });

      log.debug(`[Campaign Generate] Calling AI with single-item prompt:`, {
        systemRole: promptConfig.systemRole.substring(0, 100) + '...',
        requestLength: requestText.length,
      });

      const aiResult = await aiReq.app.locals.aiWorkerPool.processRequest(
        {
          type: `campaign_${campaignTypeId}`,
          systemPrompt: promptConfig.systemRole,
          messages: [{ role: 'user', content: requestText }],
          options: promptConfig.options,
        },
        req
      );

      if (!aiResult?.content) {
        throw new Error('AI response empty or invalid');
      }

      log.debug(`[Campaign Generate] Raw AI response (${aiResult.content.length} chars)`);

      const singleResult = parseResponse(aiResult.content, campaignConfig.responseParser);
      const mainContent = Array.isArray(singleResult)
        ? (singleResult[0] as PoemContent)
        : (singleResult as PoemContent);
      log.debug(`[Campaign Generate] Parsed single poem:`, mainContent);
      allPoems = [mainContent];
    }

    if (allPoems.length > 0) {
      log.debug(`[Campaign Generate] Generating ${allPoems.length} canvas images in parallel`);

      const canvasPromises = allPoems.map(async (poem, index) => {
        try {
          const textData: PoemContent = {
            line1: poem.line1 || '',
            line2: poem.line2 || '',
            line3: poem.line3 || '',
            line4: poem.line4 || '',
            line5: poem.line5 || '',
          };

          const { image, creditText } = await generateCampaignCanvas(
            campaignId,
            campaignTypeId,
            textData,
            thema || ''
          );

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
            creditText: creditText,
          } as Sharepic;
        } catch (canvasError) {
          log.error(
            `[Campaign Generate] Failed to generate canvas for poem ${index}:`,
            (canvasError as Error).message
          );
          return null;
        }
      });

      const sharepics = (await Promise.all(canvasPromises)).filter(
        (sp): sp is Sharepic => sp !== null
      );
      log.debug(`[Campaign Generate] Successfully generated ${sharepics.length} sharepics`);
      log.debug('[Campaign Generate] First sharepic creditText:', sharepics[0]?.creditText);

      const response: CampaignGenerateResponse = {
        success: true,
        sharepics,
        metadata: {
          generationType: 'campaign_multi',
          generatedCount: sharepics.length,
          campaignId,
          campaignTypeId,
          timestamp: new Date().toISOString(),
        },
      };

      if (campaignText) {
        response.campaignText = campaignText;
        log.debug('[Campaign Generate] Including campaign text in response');
      }

      res.json(response);
      return;
    }

    res.json({
      success: true,
      mainContent: allPoems[0] || {},
      alternatives: allPoems.slice(1),
      searchTerms: [],
    } as CampaignGenerateResponse);
  } catch (error) {
    log.error('[Campaign Generate] Error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to generate campaign text',
    } as CampaignGenerateResponse);
  }
});

export default router;
