/**
 * PromptProcessor - Core prompt configuration and assembly system
 * Handles prompt loading, template rendering, and request processing
 */

import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import required utilities
import {
  localizePromptObject,
  extractLocaleFromRequest,
} from '../../services/localization/index.js';
import { withErrorHandler, handleValidationError } from '../../utils/errors/index.js';
import {
  MARKDOWN_FORMATTING_INSTRUCTIONS,
  HTML_FORMATTING_INSTRUCTIONS,
  TITLE_GENERATION_INSTRUCTION,
  PLATFORM_SPECIFIC_GUIDELINES,
} from '../../utils/prompt/index.js';
import { sendSuccessResponseWithAttachments } from '../../utils/request/index.js';
import { enrichRequest } from '../../utils/requestEnrichment.js';

import { processAutomatischPR } from './PRAgent/index.js';
import { assemblePromptGraphAsync } from './promptAssemblyGraph.js';

// Import types
import type {
  RequestData,
  EnrichedState,
  PromptConfig,
  AIOptions,
  AssembledPrompt,
  TemplateContext,
  ProcessingResult,
} from './types/index.js';

/**
 * Generation stats logging (lazy-loaded ES module)
 * Lazy loading prevents circular dependencies
 */
let generationStatsService: any = null;

async function logGeneration(data: {
  userId: string | null;
  generationType: string;
  platform: string | null;
  tokensUsed: number | null;
  success: boolean;
}): Promise<void> {
  try {
    if (!generationStatsService) {
      const module = await import('../../database/services/GenerationStatsService/index.js');
      generationStatsService = module.getGenerationStatsService();
    }
    await generationStatsService.logGeneration(data);
  } catch (err) {
    // Silent failure - stats logging should not affect generation
  }
}

/**
 * Template engine for simple string replacement
 * Handles special placeholders and variable substitution
 */
export class SimpleTemplateEngine {
  /**
   * Render a template string with provided data
   * @param template - Template string with {{placeholders}}
   * @param data - Data object for variable substitution
   * @returns Rendered string
   */
  static render(template: string, data: TemplateContext = {}): string {
    if (!template || typeof template !== 'string') return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const cleanKey = key.trim();

      // Handle special cases
      if (cleanKey === 'TITLE_GENERATION_INSTRUCTION') {
        return TITLE_GENERATION_INSTRUCTION;
      }
      if (cleanKey === 'MARKDOWN_FORMATTING_INSTRUCTIONS') {
        return MARKDOWN_FORMATTING_INSTRUCTIONS;
      }
      if (cleanKey === 'HTML_FORMATTING_INSTRUCTIONS') {
        return HTML_FORMATTING_INSTRUCTIONS;
      }
      if (cleanKey === 'currentDate') {
        return new Date().toISOString().split('T')[0];
      }
      if (cleanKey === 'platformLimits') {
        return this.buildPlatformLimits((data.platforms as string[]) || []);
      }
      if (cleanKey === 'platformGuidelines') {
        return this.buildPlatformGuidelines((data.platforms as string[]) || []);
      }
      if (cleanKey === 'requestTypeText') {
        return this.getRequestTypeText(data.requestType as string, data.config as PromptConfig);
      }

      // Handle conditional statements
      if (cleanKey.startsWith('#if ')) {
        return ''; // Skip conditional logic for now (advanced feature)
      }

      // Handle default values
      if (cleanKey.includes('|default:')) {
        const [actualKey, defaultValue] = cleanKey.split('|default:');
        const value = this.getValue(actualKey.trim(), data);
        return value !== undefined && value !== null && value !== ''
          ? String(value)
          : defaultValue.replace(/'/g, '');
      }

      return String(this.getValue(cleanKey, data) || '');
    });
  }

  /**
   * Get nested value from data object using dot notation
   * @param key - Dot-separated key path (e.g., "request.thema")
   * @param data - Data object
   * @returns Value at key path or undefined
   */
  static getValue(key: string, data: TemplateContext): unknown {
    return key.split('.').reduce((obj: any, prop: string) => obj?.[prop], data);
  }

  /**
   * Build platform character limit string
   * @param platforms - Array of platform names
   * @returns Formatted limit string
   */
  static buildPlatformLimits(platforms: string[]): string {
    if (!Array.isArray(platforms)) return '';
    const limits = platforms
      .map((p) => {
        const guidelines = PLATFORM_SPECIFIC_GUIDELINES[p];
        if (guidelines?.maxLength && guidelines.maxLength <= 300) {
          const name = p.charAt(0).toUpperCase() + p.slice(1);
          return `${name}: Max. ${guidelines.maxLength} Zeichen`;
        }
        return '';
      })
      .filter(Boolean);
    return limits.length > 0 ? limits.join(', ') : '';
  }

  /**
   * Build platform-specific guidelines
   * @param platforms - Array of platform names
   * @returns Formatted guidelines string
   */
  static buildPlatformGuidelines(platforms: string[]): string {
    if (!Array.isArray(platforms)) return '';
    return platforms
      .map((platform) => {
        const guidelines = PLATFORM_SPECIFIC_GUIDELINES[platform];
        if (!guidelines) return '';
        return `${platform.toUpperCase()}: Maximale Länge: ${guidelines.maxLength} Zeichen. Stil: ${guidelines.style} Fokus: ${guidelines.focus} Zusätzliche Richtlinien: ${guidelines.additionalGuidelines}`;
      })
      .join('\n');
  }

  /**
   * Get request type text from configuration mapping
   * @param requestType - Request type key
   * @param config - Prompt configuration
   * @returns Mapped request type text
   */
  static getRequestTypeText(requestType: string, config: PromptConfig): string {
    if (!config?.requestTypeMapping) return requestType;
    return (
      config.requestTypeMapping[requestType] || config.requestTypeMapping.default || requestType
    );
  }
}

/**
 * Cache for loaded configurations
 */
const configCache = new Map<string, PromptConfig>();

/**
 * Load prompt configuration from JSON file
 * @param type - Configuration type (e.g., "antrag", "sharepic")
 * @returns Loaded prompt configuration
 */
export function loadPromptConfig(type: string): PromptConfig {
  if (configCache.has(type)) {
    return configCache.get(type)!;
  }

  try {
    const configPath = path.join(__dirname, '../../prompts', `${type}.json`);
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData) as PromptConfig;
    configCache.set(type, config);
    return config;
  } catch (error) {
    console.error(`[promptProcessor] Failed to load config for type: ${type}`, error);
    throw new Error(`Configuration not found for type: ${type}`);
  }
}

/**
 * Handle custom_generator special case - load prompt from database
 * Lazy loads PostgresService to avoid circular dependencies
 * @param slug - Generator slug
 * @returns Generator data from database
 */
async function loadCustomGeneratorPrompt(slug: string): Promise<any> {
  const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
  const postgresService = getPostgresInstance();
  const generators = await postgresService.query(
    'SELECT * FROM custom_generators WHERE slug = $1 LIMIT 1',
    [slug],
    { table: 'custom_generators' }
  );

  if (!generators || generators.length === 0) {
    throw new Error('Generator nicht gefunden');
  }

  return generators[0];
}

/**
 * Apply validation rules from config
 * @param requestBody - Request body data
 * @param config - Prompt configuration
 * @returns Error message or null if valid
 */
function validateRequest(requestBody: any, config: PromptConfig): string | null {
  const { validation } = config;
  if (!validation?.required) return null;

  const { customPrompt } = requestBody;
  if (customPrompt) return null; // Skip validation for custom prompts

  for (const field of validation.required) {
    if (!requestBody[field]) {
      return validation.errorMessage || `Required field missing: ${field}`;
    }
  }

  return null;
}

/**
 * Apply profile defaults for optional fields
 * Lazy loads ProfileService to avoid circular dependencies
 * @param requestData - Request data to modify
 * @param req - Express request object
 * @param type - Request type
 * @returns Modified request data
 */
async function applyProfileDefaults(requestData: any, req: any, type: string): Promise<any> {
  if (!req?.user?.id) return requestData;
  try {
    const { getProfileService } = await import('../../services/user/index.js');
    const profileService = getProfileService();
    const profile = await profileService.getProfileById(req.user.id);
    if (!profile) return requestData;

    if ((profile as any).custom_prompt?.trim()) {
      requestData.customPrompt = (profile as any).custom_prompt;
    }

    if (
      type === 'social' &&
      requestData.platforms?.includes('pressemitteilung') &&
      !requestData.zitatgeber &&
      profile.display_name
    ) {
      requestData.zitatgeber = profile.display_name;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[promptProcessor] Could not fetch profile defaults:', msg);
  }
  return requestData;
}

/**
 * Build system role with extensions
 * @param config - Prompt configuration
 * @param requestData - Request data
 * @param generatorData - Custom generator data (if applicable)
 * @returns Built system role string
 */
export function buildSystemRole(
  config: PromptConfig,
  requestData: any,
  generatorData: any = null
): string {
  // Handle sharepic multi-type case
  if (config.types) {
    const type = requestData.type || requestData.sharepicType || 'dreizeilen';
    const typeConfig = config.types[type];
    if (typeConfig?.systemRole) {
      return typeConfig.systemRole;
    }
    // If we have types config but type not found, throw descriptive error
    throw new Error(
      `Configuration error: Type '${type}' not found in types configuration. Available types: ${Object.keys(config.types).join(', ')}`
    );
  }

  let systemRole = generatorData?.prompt || config.systemRole;

  // Apply extensions based on request data
  if (config.systemRoleExtensions) {
    const extensions = config.systemRoleExtensions;

    // Check for specific platform extensions (like pressemitteilung in social)
    if (requestData.platforms?.includes('pressemitteilung') && extensions.pressemitteilung) {
      systemRole += extensions.pressemitteilung;
    }

    // Check for request type extensions (like kleine_anfrage in antrag_simple)
    if (requestData.requestType) {
      const extension = extensions[requestData.requestType] || extensions.default;
      if (extension) {
        systemRole += ' ' + extension;
      }
    }
  }

  // Add appendix
  if (config.systemRoleAppendix) {
    systemRole += ' ' + config.systemRoleAppendix;
  }

  return systemRole;
}

/**
 * Build request content using template
 * @param config - Prompt configuration
 * @param requestData - Request data
 * @param generatorData - Custom generator data (if applicable)
 * @returns Built request content
 */
export function buildRequestContent(
  config: PromptConfig,
  requestData: any,
  generatorData: any = null
): any {
  const { customPrompt } = requestData;

  if (customPrompt) {
    if (config.customPromptTemplate) {
      return SimpleTemplateEngine.render(JSON.stringify(config.customPromptTemplate), {
        ...requestData,
        config,
      });
    } else {
      return requestData; // Return structured data for custom prompts
    }
  }

  // Handle custom_generator with processed prompt
  if (config.id === 'custom_generator' && generatorData) {
    let processedPrompt = generatorData.prompt;

    // Replace form data placeholders
    const cleanFormData = { ...requestData.formData };
    delete cleanFormData.useWebSearchTool;
    delete cleanFormData.usePrivacyMode;
    delete cleanFormData.attachments;
    delete cleanFormData.useBedrock;

    for (const [key, value] of Object.entries(cleanFormData)) {
      const placeholder = `{{${key}}}`;
      processedPrompt = processedPrompt.replace(new RegExp(placeholder, 'g'), value || '');
    }

    // Manually build the request content with form data
    let requestContent = processedPrompt;

    // Add form data section if there are fields
    if (Object.keys(cleanFormData).length > 0) {
      requestContent += '\n\nFormulardaten:\n';
      for (const [key, value] of Object.entries(cleanFormData)) {
        requestContent += `${key}: ${value}\n`;
      }
    }

    return requestContent;
  }

  // Handle sharepic multi-type case
  if (config.types) {
    const type = requestData.type || requestData.sharepicType || 'dreizeilen';
    const typeConfig = config.types[type];
    if (typeConfig?.requestTemplate) {
      return SimpleTemplateEngine.render(typeConfig.requestTemplate, {
        ...requestData,
        config,
      });
    }
  }

  // Standard template rendering
  if (!config.requestTemplate) {
    return requestData;
  }
  return SimpleTemplateEngine.render(config.requestTemplate, {
    ...requestData,
    config,
  });
}

/**
 * Build web search query
 * @param config - Prompt configuration
 * @param requestData - Request data
 * @returns Web search query or null
 */
export function buildWebSearchQuery(config: PromptConfig, requestData: any): string | null {
  if (!config.features?.webSearch || !requestData.useWebSearchTool || !config.webSearchQuery) {
    return null;
  }

  return SimpleTemplateEngine.render(config.webSearchQuery, requestData);
}

/**
 * Get formatting instructions
 * @param config - Prompt configuration
 * @returns Formatting instructions or null
 */
export function getFormattingInstructions(config: PromptConfig): string | null {
  if (config.formatting === 'MARKDOWN_FORMATTING_INSTRUCTIONS') {
    return MARKDOWN_FORMATTING_INSTRUCTIONS;
  }
  if (config.formatting === 'HTML_FORMATTING_INSTRUCTIONS') {
    return HTML_FORMATTING_INSTRUCTIONS;
  }
  return config.formatting || null;
}

/**
 * Build platform-specific guidelines
 * @param config - Prompt configuration
 * @param requestData - Request data
 * @returns Formatted platform guidelines or null
 */
export function buildPlatformGuidelines(config: PromptConfig, requestData: any): string | null {
  if (!requestData.platforms || !Array.isArray(requestData.platforms) || !config.platforms) {
    return null;
  }

  const platformGuidelines: string[] = [];
  for (const platform of requestData.platforms) {
    const platformConfig = config.platforms[platform];
    if (platformConfig) {
      const guidelines: string[] = [];
      if (platformConfig.style) guidelines.push(`Stil: ${platformConfig.style}`);
      if (platformConfig.focus) guidelines.push(`Fokus: ${platformConfig.focus}`);
      if (platformConfig.additionalGuidelines)
        guidelines.push(`Zusätzliche Richtlinien:\n${platformConfig.additionalGuidelines}`);

      if (guidelines.length > 0) {
        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
        platformGuidelines.push(`**${platformName}:**\n${guidelines.join('\n')}`);
      }
    }
  }

  return platformGuidelines.length > 0 ? platformGuidelines.join('\n\n') : null;
}

/**
 * Get task-specific instructions
 * @param config - Prompt configuration
 * @param requestData - Request data
 * @returns Task instructions or null
 */
export function getTaskInstructions(config: PromptConfig, requestData: any): string | null {
  const parts: string[] = [];

  // Add base task instructions
  if (config.taskInstructions) {
    parts.push(
      SimpleTemplateEngine.render(config.taskInstructions, {
        ...requestData,
        config,
      })
    );
  }

  // Add platform-specific guidelines
  const platformGuidelines = buildPlatformGuidelines(config, requestData);
  if (platformGuidelines) {
    parts.push(platformGuidelines);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

/**
 * Get output format instructions
 * @param config - Prompt configuration
 * @param requestData - Request data
 * @returns Output format instructions or null
 */
function getOutputFormat(config: PromptConfig, requestData: any): string | null {
  if (!config.outputFormat) return null;
  return SimpleTemplateEngine.render(config.outputFormat, {
    ...requestData,
    config,
  });
}

/**
 * Build constraints from platform guidelines
 * @param config - Prompt configuration
 * @param requestData - Request data
 * @returns Constraint string or null
 */
export function buildConstraints(config: PromptConfig, requestData: any): string | null {
  const { platforms } = requestData;
  if (!platforms || !Array.isArray(platforms)) return null;

  const shortFormThreshold = config.shortFormThreshold || 300;
  const limits: string[] = [];

  for (const platform of platforms) {
    const guidelines = config.platforms?.[platform] || PLATFORM_SPECIFIC_GUIDELINES[platform];
    if (guidelines?.maxLength) {
      const name = platform.charAt(0).toUpperCase() + platform.slice(1);
      limits.push(`${name}: maximal ${guidelines.maxLength} Zeichen`);
    }
  }

  return limits.length > 0
    ? `WICHTIG: ${limits.join(', ')} - diese Grenzen sind absolut einzuhalten.`
    : null;
}

/**
 * Get AI options for request
 * @param config - Prompt configuration
 * @param requestData - Request data
 * @param typeConfig - Type-specific configuration (if applicable)
 * @returns AI options object
 */
export function getAIOptions(
  config: PromptConfig,
  requestData: any,
  typeConfig: any = null
): AIOptions {
  // For sharepic multi-type, get type-specific options
  if (config.types && !typeConfig) {
    const type = requestData.type || requestData.sharepicType || 'dreizeilen';
    typeConfig = config.types[type];
  }

  const baseOptions: AIOptions = typeConfig?.options || config.options || {};

  // Add privacy mode provider if specified
  if (requestData.usePrivacyMode && requestData.provider) {
    baseOptions.provider = requestData.provider;
  }

  // Add other flags
  if (requestData.useBedrock) {
    baseOptions.useBedrock = true;
  }

  // Pass useProMode flag to options
  if (requestData.useProMode) {
    baseOptions.useProMode = true;
  }

  // Pass useUltraMode flag to options
  if (requestData.useUltraMode) {
    baseOptions.useUltraMode = true;
  }

  return baseOptions;
}

/**
 * Main processor function for graph-based text generation
 * @param routeType - Type of generation route
 * @param req - Express request object
 * @param res - Express response object
 */
export async function processGraphRequest(routeType: string, req: any, res: any): Promise<void> {
  return withErrorHandler(async (req: any, res: any) => {
    const requestData = req.body;
    const {
      customPrompt,
      useWebSearchTool,
      usePrivacyMode,
      provider,
      knowledgeContent,
      selectedDocumentIds,
      selectedTextIds,
      searchQuery,
      useAutomaticSearch,
      useNotebookEnrich,
    } = requestData;

    // Handle structured customPrompt from frontend
    let extractedInstructions = customPrompt;
    let extractedKnowledgeContent = knowledgeContent;

    if (customPrompt && typeof customPrompt === 'object' && !Array.isArray(customPrompt)) {
      // Frontend sent structured data with instructions and knowledgeContent
      extractedInstructions = customPrompt.instructions || null;
      extractedKnowledgeContent = customPrompt.knowledgeContent || knowledgeContent || null;

      console.log('[promptProcessor] Detected structured customPrompt:', {
        hasInstructions: !!extractedInstructions,
        hasKnowledge: !!extractedKnowledgeContent,
        knowledgeLength: extractedKnowledgeContent ? extractedKnowledgeContent.length : 0,
      });
    }

    console.log(`[promptProcessor] Processing ${routeType} request`);
    console.log(`[promptProcessor] Request data:`, {
      useBedrock: requestData.useBedrock,
      usePrivacyMode: requestData.usePrivacyMode,
      provider: requestData.provider,
      hasCustomPrompt: !!customPrompt,
      hasKnowledgeContent: !!extractedKnowledgeContent,
      hasSelectedDocuments: !!(selectedDocumentIds && selectedDocumentIds.length > 0),
      hasSelectedTexts: !!(selectedTextIds && selectedTextIds.length > 0),
      hasSearchQuery: !!searchQuery,
      useAutomaticSearch: useAutomaticSearch || false,
      hasOtherData: Object.keys(requestData).length,
    });

    // Route to PR Agent if "automatisch" platform detected
    if (routeType === 'social' && requestData.platforms?.includes('automatisch')) {
      console.log('[promptProcessor] Routing to PR Agent');
      return processAutomatischPR(requestData, req, res);
    }

    // Load configuration and localize it
    const baseConfig = loadPromptConfig(routeType);
    const userLocale = extractLocaleFromRequest(req);
    const config = localizePromptObject(baseConfig, userLocale);
    console.log(`[promptProcessor] Using locale: ${userLocale}`);

    // Validate request
    const validationError = validateRequest(requestData, config);
    if (validationError) {
      return handleValidationError(res, `/${routeType}`, validationError);
    }

    // Apply profile defaults for optional fields (e.g., customPrompt fallback, zitatgeber)
    await applyProfileDefaults(requestData, req, routeType);

    // Re-extract instructions after profile defaults may have set customPrompt
    if (!extractedInstructions && requestData.customPrompt) {
      extractedInstructions = requestData.customPrompt;
    }

    // Handle custom_generator special case
    let generatorData: any = null;
    if (config.features?.customPromptFromDb) {
      generatorData = await loadCustomGeneratorPrompt(requestData.slug);
      console.log(`[promptProcessor] Loaded generator: ${generatorData?.name ?? 'unknown'}`);
    }

    // Build system role
    const systemRole = buildSystemRole(config, requestData, generatorData);

    // Build request content
    const requestContent = buildRequestContent(config, requestData, generatorData);

    // Build constraints
    const constraints = buildConstraints(config, requestData);

    // Get formatting instructions
    const formatting = getFormattingInstructions(config);

    // Get task-specific instructions
    const taskInstructions = getTaskInstructions(config, requestData);

    // Get output format instructions
    const outputFormat = getOutputFormat(config, requestData);

    // Build web search query
    const webSearchQuery = buildWebSearchQuery(config, requestData);

    // Use unified enrichment service
    const enrichedState = await enrichRequest(requestData, {
      type: routeType,
      enableUrls: config.features?.urlCrawl !== false,
      enableWebSearch: !!webSearchQuery,
      enableDocQnA: config.features?.docQnA !== false,
      usePrivacyMode: usePrivacyMode || false,
      useProMode: requestData.useProMode || false,
      webSearchQuery,
      systemRole,
      constraints,
      formatting,
      taskInstructions: taskInstructions || null,
      outputFormat: outputFormat || null,
      instructions: extractedInstructions || null,
      knowledgeContent: extractedKnowledgeContent || null,
      selectedDocumentIds: selectedDocumentIds || [],
      selectedTextIds: selectedTextIds || [],
      searchQuery: searchQuery || null,
      useAutomaticSearch: useAutomaticSearch || false,
      examples: [], // TODO: Implement examples from config
      provider,
      aiWorkerPool: req.app.locals.aiWorkerPool,
      req,
      enableNotebookEnrich: useNotebookEnrich ?? config.features?.notebookEnrich ?? false,
    });

    // Update request content in enriched state (preserve original request with platforms)
    enrichedState.requestFormatted = requestContent;

    // Add tools if specified in config
    if (config.tools) {
      enrichedState.tools = config.tools;
    }

    // Assemble prompt using enriched state
    // Note: EnrichedState is compatible with PromptAssemblyState at runtime
    const promptResult = await assemblePromptGraphAsync(enrichedState as any);
    console.log(`[promptProcessor] LangGraph assembly complete for ${routeType}`);

    // Prepare AI Worker payload
    const aiOptions = getAIOptions(config, requestData);
    console.log(`[promptProcessor] AI Options:`, aiOptions);
    console.log(`[promptProcessor] About to send useBedrock:`, requestData.useBedrock);

    // Log instructions if present
    if (enrichedState.instructions) {
      console.log(`[promptProcessor] Instructions (customPrompt):`, enrichedState.instructions);
    }

    const payload = {
      systemPrompt: promptResult.system,
      messages: promptResult.messages,
      options: {
        ...aiOptions,
        ...(promptResult.tools?.length > 0 && { tools: promptResult.tools }),
        ...(enrichedState.enrichmentMetadata?.enableDocQnA ? { useDocumentQnA: true } : {}),
      },
      metadata: {
        webSearchSources: enrichedState.enrichmentMetadata?.webSearchSources || null,
        platforms: requestData.platforms || null,
      },
    };

    // Process AI request
    const result = await req.app.locals.aiWorkerPool.processRequest(
      {
        type: routeType,
        usePrivacyMode: usePrivacyMode || false,
        useBedrock: requestData.useBedrock || false,
        ...payload,
      },
      req
    );

    if (!result.success) {
      console.error(`[promptProcessor] AI Worker error for ${routeType}:`, result.error);
      // Log failed generation
      logGeneration({
        userId: req.user?.id || req.session?.passport?.user?.id || null,
        generationType: routeType,
        platform: requestData.platforms?.[0] || null,
        tokensUsed: null,
        success: false,
      });
      throw new Error(result.error);
    }

    // Log successful generation (fire-and-forget)
    logGeneration({
      userId: req.user?.id || req.session?.passport?.user?.id || null,
      generationType: routeType,
      platform: requestData.platforms?.[0] || null,
      tokensUsed: result.usage?.total_tokens || null,
      success: true,
    });

    // Cache enriched context for future edit requests
    if (req.session?.id) {
      try {
        const { redisClient } = await import('../../utils/redis/index.js');
        const contextCacheKey = `edit_context:${req.session.id}:${routeType}`;

        const contextData = {
          originalRequest: requestData,
          enrichedState: {
            type: routeType,
            platforms: requestData.platforms || [],
            theme: requestData.theme || requestData.thema || requestData.details || null,
            urlsScraped: enrichedState.enrichmentMetadata?.urlsProcessed || [],
            documentsUsed:
              enrichedState.documents
                ?.filter(
                  (d: any) => d.type === 'text' && d.source?.metadata?.contentSource === 'url_crawl'
                )
                .map((d: any) => ({
                  title: d.source.metadata?.title || 'Document',
                  url: d.source.metadata?.url || null,
                })) || [],
            docQnAUsed: enrichedState.enrichmentMetadata?.enableDocQnA || false,
            vectorSearchUsed: (selectedDocumentIds && selectedDocumentIds.length > 0) || false,
            webSearchUsed: (enrichedState.enrichmentMetadata?.webSearchSources?.length ?? 0) > 0,
          },
          timestamp: Date.now(),
        };

        // Cache for 1 hour
        await redisClient.setEx(contextCacheKey, 3600, JSON.stringify(contextData));
        console.log(`[promptProcessor] Cached edit context: ${contextCacheKey}`);
      } catch (cacheError) {
        // Don't fail the request if caching fails
        const errorMessage = cacheError instanceof Error ? cacheError.message : String(cacheError);
        console.error('[promptProcessor] Failed to cache edit context:', errorMessage);
      }
    }

    // Build enrichment summary for frontend
    const enrichmentSummary = {
      urlsScraped: enrichedState.enrichmentMetadata?.urlsProcessed?.length || 0,
      documentsProcessed: enrichedState.documents?.length || 0,
      docQnAUsed: enrichedState.enrichmentMetadata?.enableDocQnA || false,
      vectorSearchUsed: (selectedDocumentIds && selectedDocumentIds.length > 0) || false,
      webSearchUsed: (enrichedState.enrichmentMetadata?.webSearchSources?.length ?? 0) > 0,
      autoSearchUsed: enrichedState.enrichmentMetadata?.autoSearchUsed || false,
      autoSelectedDocuments: enrichedState.enrichmentMetadata?.autoSelectedDocuments || [],
      notebookEnrichUsed: enrichedState.enrichmentMetadata?.notebookEnrichUsed || false,
      sources: [
        ...(enrichedState.enrichmentMetadata?.urlsProcessed || []).map((url: string) => ({
          type: 'url',
          title: 'Gescrapte Website',
          url: url,
        })),
        ...(enrichedState.enrichmentMetadata?.webSearchSources || []).map((source: any) => ({
          type: 'websearch',
          title: source.title || source.url,
          url: source.url,
        })),
        ...(enrichedState.enrichmentMetadata?.autoSelectedDocuments || []).map((doc: any) => ({
          type: 'auto-document',
          title: doc.title,
          filename: doc.filename,
          relevance: doc.relevance_percent,
        })),
      ],
    };

    // Send standardized success response
    sendSuccessResponseWithAttachments(
      res,
      result,
      `/${routeType}`,
      requestData,
      {
        hasAttachments: enrichedState.documents.length > 0,
        summary: {
          count: enrichedState.documents.length,
          totalSizeMB: 0,
          types: [],
          files: [],
        },
        enrichmentSummary,
      },
      usePrivacyMode,
      provider
    );
  }, `/${routeType}`)(req, res, () => {});
}
