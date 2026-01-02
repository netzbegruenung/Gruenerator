/**
 * Sharepic Composer Service
 *
 * Main orchestration service for text-to-sharepic generation.
 * Coordinates layout planning, component rendering, and caching.
 */

import type { Request } from 'express';
import type { Canvas, CanvasRenderingContext2D } from 'canvas';
import { createCanvas, registerFont } from 'canvas';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import type {
  SharepicComposerOptions,
  GenerationOptions,
  SharepicResult,
  LayoutPlan,
  ZoneConfig,
  GeneratedText,
  ZoneWithBounds
} from './types.js';

import { renderComponent, CORPORATE_DESIGN } from './ComponentRegistry.js';
import { getTemplate, getTemplateZonesWithBounds, CANVAS_DIMENSIONS } from './zoneTemplates.js';
import { generateLayoutPlan, generateLayoutPlanWithAI, validateLayoutPlan } from './LayoutPlanner.js';
import { generateLayoutWithRetry, editLayout } from './aiLayoutGenerator.js';
import { validateAIOutput } from './layoutValidator.js';
import imagePickerService from '../image/ImageSelectionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Font paths
const FONT_PATH = path.resolve(__dirname, '../../public/fonts/GrueneTypeNeue-Regular.ttf');
const PTSANS_REGULAR_PATH = path.resolve(__dirname, '../../public/fonts/PTSans-Regular.ttf');
const PTSANS_BOLD_PATH = path.resolve(__dirname, '../../public/fonts/PTSans-Bold.ttf');

// Register fonts
try {
  registerFont(FONT_PATH, { family: 'GrueneTypeNeue' });
  if (fs.existsSync(PTSANS_REGULAR_PATH)) {
    registerFont(PTSANS_REGULAR_PATH, { family: 'PTSans-Regular' });
  }
  if (fs.existsSync(PTSANS_BOLD_PATH)) {
    registerFont(PTSANS_BOLD_PATH, { family: 'PTSans-Bold' });
  }
} catch (err: any) {
  console.warn('[SharepicComposer] Font registration warning:', err.message);
}

/**
 * SharepicComposer class
 * Handles the complete workflow from description to rendered image
 */
export class SharepicComposer {
  private redis: any;
  private claudeApiHelper: any;
  private cacheEnabled: boolean;
  private cacheTTL: number;

  constructor(options: SharepicComposerOptions = {}) {
    this.redis = options.redis || null;
    this.claudeApiHelper = options.claudeApiHelper || null;
    this.cacheEnabled = options.cacheEnabled !== false && this.redis !== null;
    this.cacheTTL = options.cacheTTL || 3600; // 1 hour default
  }

  /**
   * Generate a sharepic from a text description
   * Main entry point for the service
   */
  async generateFromDescription(description: string, options: GenerationOptions = {}): Promise<SharepicResult> {
    const startTime = Date.now();
    console.log('[SharepicComposer] Starting generation for:', description.substring(0, 100));

    try {
      // Step 1: Check cache if enabled
      const cacheKey = this.generateCacheKey(description, options);
      if (this.cacheEnabled && !options.skipCache) {
        const cached = await this.getFromCache(cacheKey);
        if (cached) {
          console.log('[SharepicComposer] Cache hit, returning cached result');
          return {
            ...cached,
            fromCache: true,
            generationTime: Date.now() - startTime
          };
        }
      }

      // Step 2: Generate layout plan
      let layoutPlan: LayoutPlan;
      if (options.useAI && this.claudeApiHelper) {
        layoutPlan = await generateLayoutPlanWithAI(description, this.claudeApiHelper, options);
      } else {
        layoutPlan = await generateLayoutPlan(description, options);
      }

      // Step 3: Validate layout plan
      const validation = validateLayoutPlan(layoutPlan);
      if (!validation.valid) {
        console.warn('[SharepicComposer] Layout validation warnings:', validation.errors);
      }

      // Step 4: Override content if provided
      if (options.content) {
        layoutPlan.content = { ...layoutPlan.content, ...options.content };
      }

      // Step 5: Override template if provided
      if (options.templateId) {
        layoutPlan.templateId = options.templateId;
        const template = getTemplate(options.templateId);
        if (template) {
          layoutPlan.dimensions = template.dimensions;
        }
      }

      // Step 6: Render the sharepic
      const result = await this.renderLayoutPlan(layoutPlan);

      // Step 7: Cache the result
      if (this.cacheEnabled) {
        await this.saveToCache(cacheKey, result);
      }

      const generationTime = Date.now() - startTime;
      console.log(`[SharepicComposer] Generation completed in ${generationTime}ms`);

      return {
        ...result,
        layoutPlan,
        fromCache: false,
        generationTime
      };

    } catch (error: any) {
      console.error('[SharepicComposer] Generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate a sharepic from a pre-defined layout plan
   */
  async generateFromPlan(layoutPlan: LayoutPlan, options: GenerationOptions = {}): Promise<SharepicResult> {
    const startTime = Date.now();
    console.log('[SharepicComposer] Generating from plan:', layoutPlan.templateId);

    // Validate the plan
    const validation = validateLayoutPlan(layoutPlan);
    if (!validation.valid) {
      throw new Error(`Invalid layout plan: ${validation.errors.join(', ')}`);
    }

    // Render the plan
    const result = await this.renderLayoutPlan(layoutPlan);

    return {
      ...result,
      layoutPlan,
      generationTime: Date.now() - startTime
    };
  }

  /**
   * Render a layout plan to an image
   */
  async renderLayoutPlan(plan: LayoutPlan): Promise<SharepicResult> {
    const { width, height } = plan.dimensions;
    const canvas: Canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    console.log(`[SharepicComposer] Rendering ${width}x${height} canvas`);

    // Get template zones with bounds
    const templateZones = getTemplateZonesWithBounds(plan.templateId);
    if (!templateZones) {
      throw new Error(`Template not found: ${plan.templateId}`);
    }

    // Render each zone in order
    for (const zoneConfig of plan.zones) {
      if (!zoneConfig.component) continue;

      // Find the zone definition from template
      const zoneDef = templateZones.find((z: ZoneWithBounds) => z.name === zoneConfig.zoneName);
      if (!zoneDef) {
        console.warn(`[SharepicComposer] Zone not found in template: ${zoneConfig.zoneName}`);
        continue;
      }

      // Merge content into params if needed
      const params = this.mergeContentIntoParams(zoneConfig, plan.content);

      console.log(`[SharepicComposer] Rendering zone: ${zoneConfig.zoneName} with ${zoneConfig.component}`);

      try {
        await renderComponent(ctx, zoneConfig.component, params, zoneDef.bounds);
      } catch (error: any) {
        console.error(`[SharepicComposer] Error rendering zone ${zoneConfig.zoneName}:`, error.message);
      }
    }

    // Convert to base64
    const buffer = canvas.toBuffer('image/png');
    const base64 = buffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    return {
      image: dataUrl,
      width,
      height,
      format: 'png',
      size: buffer.length
    };
  }

  /**
   * Merge content into component parameters
   */
  private mergeContentIntoParams(zoneConfig: ZoneConfig, content?: GeneratedText): Record<string, any> {
    const params = { ...zoneConfig.params };

    // Map zone names to content fields
    const contentMapping: Record<string, string[]> = {
      'main-text': ['headline', 'mainText'],
      'header': ['headline'],
      'text-area': ['headline', 'mainText'],
      'text-block': ['headline', 'mainText'],
      'quote-text': ['quote'],
      'body': ['body'],
      'subtext': ['subText', 'body'],
      'footer': ['footer', 'body'],
      'attribution': ['attribution']
    };

    const contentFields = contentMapping[zoneConfig.zoneName];
    if (contentFields && content) {
      for (const field of contentFields) {
        if (content[field as keyof GeneratedText] && !params.text && !params.quote) {
          if (zoneConfig.component === 'text-quote') {
            params.text = content[field as keyof GeneratedText];
            if (content.attribution) {
              params.attribution = content.attribution;
            }
          } else {
            params.text = content[field as keyof GeneratedText];
          }
          break;
        }
      }
    }

    return params;
  }

  /**
   * Generate a cache key for a request
   */
  private generateCacheKey(description: string, options: GenerationOptions): string {
    const payload = JSON.stringify({
      description: description.toLowerCase().trim(),
      templateId: options.templateId,
      content: options.content
    });
    return `sharepic:${crypto.createHash('md5').update(payload).digest('hex')}`;
  }

  /**
   * Get result from cache
   */
  private async getFromCache(key: string): Promise<SharepicResult | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error: any) {
      console.warn('[SharepicComposer] Cache read error:', error.message);
    }
    return null;
  }

  /**
   * Save result to cache
   */
  private async saveToCache(key: string, result: SharepicResult): Promise<void> {
    if (!this.redis) return;

    try {
      // Don't cache the full image data, just the layout plan
      const cacheData = {
        image: result.image,
        width: result.width,
        height: result.height,
        format: result.format,
        cachedAt: Date.now()
      };
      await this.redis.setEx(key, this.cacheTTL, JSON.stringify(cacheData));
      console.log('[SharepicComposer] Result cached with key:', key);
    } catch (error: any) {
      console.warn('[SharepicComposer] Cache write error:', error.message);
    }
  }

  /**
   * Generate multiple variants of a sharepic
   */
  async generateVariants(description: string, count: number = 4, options: GenerationOptions = {}): Promise<SharepicResult[]> {
    console.log(`[SharepicComposer] Generating ${count} variants`);

    const variants: SharepicResult[] = [];
    const templates = ['hero', 'quote', 'info', 'campaign'];
    const moods = ['serious', 'energetic', 'warm', 'fresh'];

    for (let i = 0; i < count; i++) {
      try {
        const variantOptions: GenerationOptions = {
          ...options,
          templateId: templates[i % templates.length],
          skipCache: true // Each variant should be unique
        };

        const result = await this.generateFromDescription(description, variantOptions);
        variants.push({
          variantId: i + 1,
          templateId: variantOptions.templateId,
          ...result
        } as SharepicResult);
      } catch (error: any) {
        console.error(`[SharepicComposer] Variant ${i + 1} failed:`, error.message);
      }
    }

    return variants;
  }

  /**
   * Update specific content in an existing layout plan and re-render
   */
  async updateAndRender(layoutPlan: LayoutPlan, contentUpdates: Partial<GeneratedText>): Promise<SharepicResult> {
    const updatedPlan: LayoutPlan = {
      ...layoutPlan,
      content: { ...layoutPlan.content, ...contentUpdates }
    };

    return this.generateFromPlan(updatedPlan);
  }

  /**
   * Generate a sharepic using AI for both text generation and layout planning
   */
  async generateFromAI(description: string, req: Request, options: GenerationOptions = {}): Promise<SharepicResult> {
    const startTime = Date.now();
    console.log('[SharepicComposer] Starting AI generation for:', description.substring(0, 100));

    const aiWorkerPool = (req.app as any).locals.aiWorkerPool;
    if (!aiWorkerPool) {
      throw new Error('AI Worker Pool is not available');
    }

    try {
      // Step 1: Generate layout with AI
      console.log('[SharepicComposer] Calling AI for layout generation...');
      const aiOutput = await generateLayoutWithRetry(description, aiWorkerPool, req, options);

      // Step 2: Validate and correct AI output
      const validation = validateAIOutput(aiOutput);

      if (!validation.valid) {
        console.warn('[SharepicComposer] AI layout validation failed:', validation.errors);
        console.log('[SharepicComposer] Falling back to rule-based generation');
        const fallbackResult = await this.generateFromDescription(description, options);
        return {
          ...fallbackResult,
          aiGenerated: false,
          fallbackReason: validation.errors.join(', ')
        };
      }

      if (validation.warnings.length > 0) {
        console.warn('[SharepicComposer] AI layout warnings:', validation.warnings);
      }

      // Step 3: Build the layout plan for rendering
      const template = getTemplate(validation.corrected.layout.templateId);
      if (!template) {
        throw new Error(`Template not found: ${validation.corrected.layout.templateId}`);
      }

      let zones = validation.corrected.layout.zones;

      // Step 3.5: Handle @auto-select for background images
      let selectedImageInfo: any = null;
      const backgroundZone = zones.find((z: ZoneConfig) => z.zoneName === 'background' && z.component === 'background-image');

      if (backgroundZone && backgroundZone.params?.imagePath === '@auto-select') {
        console.log('[SharepicComposer] Detecting @auto-select, calling image picker...');

        try {
          // Use the generated text content for image matching
          const textForMatching = [
            description,
            validation.corrected.generatedText.headline,
            validation.corrected.generatedText.quote,
            validation.corrected.generatedText.body,
            ...(validation.corrected.generatedText.lines || [])
          ].filter(Boolean).join(' ');

          const imageResult = await imagePickerService.selectBestImage(
            textForMatching,
            aiWorkerPool,
            { sharepicType: template.category },
            req
          );

          if (imageResult.selectedImage) {
            // Update the background zone with the selected image path
            zones = zones.map((z: ZoneConfig) => {
              if (z.zoneName === 'background' && z.component === 'background-image') {
                return {
                  ...z,
                  params: {
                    ...z.params,
                    imagePath: `sharepic_example_bg/${imageResult.selectedImage.filename}`
                  }
                };
              }
              return z;
            });

            selectedImageInfo = {
              selectedImage: imageResult.selectedImage,
              confidence: imageResult.confidence,
              reasoning: imageResult.reasoning,
              alternatives: imageResult.alternatives
            };

            console.log(`[SharepicComposer] Image selected: ${imageResult.selectedImage.filename} (confidence: ${imageResult.confidence})`);
          }
        } catch (imageError: any) {
          console.warn('[SharepicComposer] Image selection failed, using solid background:', imageError.message);
          // Fallback to solid background if image selection fails
          zones = zones.map((z: ZoneConfig) => {
            if (z.zoneName === 'background' && z.component === 'background-image') {
              return {
                zoneName: 'background',
                component: 'background-solid',
                params: { color: CORPORATE_DESIGN.colors.tanne }
              };
            }
            return z;
          });
        }
      }

      const layoutPlan: LayoutPlan = {
        templateId: validation.corrected.layout.templateId,
        dimensions: template.dimensions,
        zones,
        content: validation.corrected.generatedText,
        analysis: { category: template.category, aiGenerated: true }
      };

      // Step 4: Validate the layout plan
      const planValidation = validateLayoutPlan(layoutPlan);
      if (!planValidation.valid) {
        console.warn('[SharepicComposer] Layout plan validation warnings:', planValidation.errors);
      }

      // Step 5: Render the sharepic
      const result = await this.renderLayoutPlan(layoutPlan);

      const generationTime = Date.now() - startTime;
      console.log(`[SharepicComposer] AI generation completed in ${generationTime}ms`);

      return {
        ...result,
        layoutPlan,
        generatedText: validation.corrected.generatedText,
        aiGenerated: true,
        validationWarnings: validation.warnings,
        generationTime,
        ...(selectedImageInfo && { imageSelection: selectedImageInfo })
      };

    } catch (error: any) {
      console.error('[SharepicComposer] AI generation failed:', error.message);
      console.log('[SharepicComposer] Falling back to rule-based generation');

      // Fallback to rule-based generation
      const fallbackResult = await this.generateFromDescription(description, options);
      return {
        ...fallbackResult,
        aiGenerated: false,
        fallbackReason: error.message
      };
    }
  }

  /**
   * Get available templates for a content type
   */
  getTemplatesForContent(contentType: string): string[] {
    const contentTemplateMap: Record<string, string[]> = {
      quote: ['quote', 'hero'],
      slogan: ['three-line', 'hero'],
      info: ['info', 'split-vertical'],
      event: ['split-vertical', 'info'],
      announcement: ['hero', 'info'],
      story: ['story']
    };

    return contentTemplateMap[contentType] || ['hero', 'info', 'quote'];
  }

  /**
   * Edit an existing sharepic layout using AI
   */
  async editFromAI(currentLayoutPlan: LayoutPlan, editRequest: string, req: Request): Promise<SharepicResult> {
    const startTime = Date.now();
    console.log('[SharepicComposer] Starting AI edit for:', editRequest.substring(0, 100));

    const aiWorkerPool = (req.app as any).locals.aiWorkerPool;
    if (!aiWorkerPool) {
      throw new Error('AI Worker Pool is not available');
    }

    try {
      // Step 1: Call AI to edit the layout
      console.log('[SharepicComposer] Calling AI for layout editing...');
      const aiOutput = await editLayout(currentLayoutPlan, editRequest, aiWorkerPool, req);

      // Step 2: Validate and correct AI output
      const validation = validateAIOutput(aiOutput);

      if (!validation.valid) {
        throw new Error(`AI edit validation failed: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        console.warn('[SharepicComposer] AI edit warnings:', validation.warnings);
      }

      // Step 3: Build the layout plan for rendering
      const template = getTemplate(validation.corrected.layout.templateId);
      if (!template) {
        throw new Error(`Template not found: ${validation.corrected.layout.templateId}`);
      }

      let zones = validation.corrected.layout.zones;

      // Step 3.5: Handle @auto-select for background images
      let selectedImageInfo: any = null;
      const backgroundZone = zones.find((z: ZoneConfig) => z.zoneName === 'background' && z.component === 'background-image');

      if (backgroundZone && backgroundZone.params?.imagePath === '@auto-select') {
        console.log('[SharepicComposer] Detecting @auto-select in edit, calling image picker...');

        try {
          const textForMatching = [
            editRequest,
            validation.corrected.generatedText.headline,
            validation.corrected.generatedText.quote,
            validation.corrected.generatedText.body,
            ...(validation.corrected.generatedText.lines || [])
          ].filter(Boolean).join(' ');

          const imageResult = await imagePickerService.selectBestImage(
            textForMatching,
            aiWorkerPool,
            { sharepicType: template.category },
            req
          );

          if (imageResult.selectedImage) {
            zones = zones.map((z: ZoneConfig) => {
              if (z.zoneName === 'background' && z.component === 'background-image') {
                return {
                  ...z,
                  params: {
                    ...z.params,
                    imagePath: `sharepic_example_bg/${imageResult.selectedImage.filename}`
                  }
                };
              }
              return z;
            });

            selectedImageInfo = {
              selectedImage: imageResult.selectedImage,
              confidence: imageResult.confidence
            };

            console.log(`[SharepicComposer] Image selected: ${imageResult.selectedImage.filename}`);
          }
        } catch (imageError: any) {
          console.warn('[SharepicComposer] Image selection failed:', imageError.message);
          zones = zones.map((z: ZoneConfig) => {
            if (z.zoneName === 'background' && z.component === 'background-image') {
              return {
                zoneName: 'background',
                component: 'background-solid',
                params: { color: CORPORATE_DESIGN.colors.tanne }
              };
            }
            return z;
          });
        }
      }

      const layoutPlan: LayoutPlan = {
        templateId: validation.corrected.layout.templateId,
        dimensions: template.dimensions,
        zones,
        content: validation.corrected.generatedText,
        analysis: { category: template.category, aiGenerated: true, edited: true }
      };

      // Step 4: Render the sharepic
      const result = await this.renderLayoutPlan(layoutPlan);

      const generationTime = Date.now() - startTime;
      console.log(`[SharepicComposer] AI edit completed in ${generationTime}ms`);

      return {
        ...result,
        layoutPlan,
        generatedText: validation.corrected.generatedText,
        aiGenerated: true,
        edited: true,
        validationWarnings: validation.warnings,
        generationTime,
        ...(selectedImageInfo && { imageSelection: selectedImageInfo })
      };

    } catch (error: any) {
      console.error('[SharepicComposer] AI edit failed:', error.message);
      throw error;
    }
  }

  /**
   * Preview a layout plan without full rendering (lighter operation)
   */
  previewLayoutPlan(description: string, options: GenerationOptions = {}): Promise<LayoutPlan> {
    // Just generate the plan without rendering
    return generateLayoutPlan(description, options);
  }
}

/**
 * Create a configured SharepicComposer instance
 */
export function createSharepicComposer(options: SharepicComposerOptions = {}): SharepicComposer {
  return new SharepicComposer(options);
}

/**
 * Quick generate function for simple use cases
 */
export async function quickGenerate(description: string, options: GenerationOptions = {}): Promise<SharepicResult> {
  const composer = new SharepicComposer();
  return composer.generateFromDescription(description, options);
}
