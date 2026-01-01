import fs from 'fs';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import path from 'path';
import { createRequire } from 'module';

// Import required utilities
import { enrichRequest } from '../../utils/requestEnrichment.js';
import { assemblePromptGraphAsync } from './promptAssemblyGraph.js';
import { sendSuccessResponseWithAttachments } from '../../utils/responseFormatter.js';
import { withErrorHandler, handleValidationError } from '../../utils/errorHandler.js';
import { MARKDOWN_FORMATTING_INSTRUCTIONS,
  HTML_FORMATTING_INSTRUCTIONS,
  TITLE_GENERATION_INSTRUCTION,
  PLATFORM_SPECIFIC_GUIDELINES } from '../../utils/promptUtils.js';
import { localizePromptObject, extractLocaleFromRequest } from '../../utils/localizationHelper.js';

// Generation stats logging (lazy-loaded ES module)
let generationStatsService = null;
async function logGeneration(data) {
  try {
    if (!generationStatsService) {
      const module = await import('../../database/services/GenerationStatsService.js');
      generationStatsService = module.getGenerationStatsService();
    }
    await generationStatsService.logGeneration(data);
  } catch (err) {
    // Silent failure - stats logging should not affect generation
  }
}

// For custom_generator database access
// PostgresService imported dynamically in loadCustomGeneratorPrompt function

// Template engine for simple string replacement
class SimpleTemplateEngine {
  static render(template, data = {}) {
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
        return this.buildPlatformLimits(data.platforms || []);
      }
      if (cleanKey === 'platformGuidelines') {
        return this.buildPlatformGuidelines(data.platforms || []);
      }
      if (cleanKey === 'requestTypeText') {
        return this.getRequestTypeText(data.requestType, data.config);
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
          ? value
          : defaultValue.replace(/'/g, '');
      }

      return this.getValue(cleanKey, data) || '';
    });
  }

  static getValue(key, data) {
    return key.split('.').reduce((obj, prop) => obj?.[prop], data);
  }

  static buildPlatformLimits(platforms) {
    if (!Array.isArray(platforms)) return '';
    const limits = platforms.map(p => {
      const guidelines = PLATFORM_SPECIFIC_GUIDELINES[p];
      if (guidelines?.maxLength && guidelines.maxLength <= 300) {
        const name = p.charAt(0).toUpperCase() + p.slice(1);
        return `${name}: Max. ${guidelines.maxLength} Zeichen`;
      }
      return '';
    }).filter(Boolean);
    return limits.length > 0 ? limits.join(', ') : '';
  }

  static buildPlatformGuidelines(platforms) {
    if (!Array.isArray(platforms)) return '';
    return platforms.map(platform => {
      const guidelines = PLATFORM_SPECIFIC_GUIDELINES[platform];
      if (!guidelines) return '';
      return `${platform.toUpperCase()}: Maximale Länge: ${guidelines.maxLength} Zeichen. Stil: ${guidelines.style} Fokus: ${guidelines.focus} Zusätzliche Richtlinien: ${guidelines.additionalGuidelines}`;
    }).join('\\n');
  }

  static getRequestTypeText(requestType, config) {
    if (!config?.requestTypeMapping) return requestType;
    return config.requestTypeMapping[requestType] || config.requestTypeMapping.default || requestType;
  }
}

// Cache for loaded configurations
const configCache = new Map();

// Load prompt configuration from JSON file
function loadPromptConfig(type) {
  if (configCache.has(type)) {
    return configCache.get(type);
  }

  try {
    const configPath = path.join(__dirname, '../../prompts', `${type}.json`);
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    configCache.set(type, config);
    return config;
  } catch (error) {
    console.error(`[promptProcessor] Failed to load config for type: ${type}`, error);
    throw new Error(`Configuration not found for type: ${type}`);
  }
}

// Handle custom_generator special case - load prompt from database
async function loadCustomGeneratorPrompt(slug) {
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

// Apply validation rules from config
function validateRequest(requestBody, config) {
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

async function applyProfileDefaults(requestData, req, type) {
  if (type === 'social' &&
      requestData.platforms?.includes('pressemitteilung') &&
      !requestData.zitatgeber) {

    if (req?.user?.id) {
      try {
        const { getProfileService } = await import('../../services/ProfileService.mjs');
        const profileService = getProfileService();
        const profile = await profileService.getProfileById(req.user.id);

        if (profile?.display_name) {
          requestData.zitatgeber = profile.display_name;
          console.log('[promptProcessor] Applied default zitatgeber from profile:', profile.display_name);
        }
      } catch (error) {
        console.warn('[promptProcessor] Could not fetch profile for default zitatgeber:', error.message);
      }
    }
  }
  return requestData;
}

// Build system role with extensions
function buildSystemRole(config, requestData, generatorData = null) {
  // Handle sharepic multi-type case
  if (config.types) {
    const type = requestData.type || requestData.sharepicType || 'dreizeilen';
    const typeConfig = config.types[type];
    if (typeConfig?.systemRole) {
      return typeConfig.systemRole;
    }
    // If we have types config but type not found, throw descriptive error
    throw new Error(`Configuration error: Type '${type}' not found in types configuration. Available types: ${Object.keys(config.types).join(', ')}`);
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

// Build request content using template
function buildRequestContent(config, requestData, generatorData = null) {
  const { customPrompt } = requestData;

  if (customPrompt) {
    if (config.customPromptTemplate) {
      return SimpleTemplateEngine.render(JSON.stringify(config.customPromptTemplate), {
        ...requestData,
        config
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
    if (typeConfig) {
      return SimpleTemplateEngine.render(typeConfig.requestTemplate, {
        ...requestData,
        config
      });
    }
  }

  // Standard template rendering
  return SimpleTemplateEngine.render(config.requestTemplate, {
    ...requestData,
    config
  });
}

// Build web search query
function buildWebSearchQuery(config, requestData) {
  if (!config.features?.webSearch || !requestData.useWebSearchTool) {
    return null;
  }

  return SimpleTemplateEngine.render(config.webSearchQuery, requestData);
}

// Get formatting instructions
function getFormattingInstructions(config) {
  if (config.formatting === 'MARKDOWN_FORMATTING_INSTRUCTIONS') {
    return MARKDOWN_FORMATTING_INSTRUCTIONS;
  }
  if (config.formatting === 'HTML_FORMATTING_INSTRUCTIONS') {
    return HTML_FORMATTING_INSTRUCTIONS;
  }
  return config.formatting || null;
}

// Build platform-specific guidelines
function buildPlatformGuidelines(config, requestData) {
  if (!requestData.platforms || !Array.isArray(requestData.platforms) || !config.platforms) {
    return null;
  }

  const platformGuidelines = [];
  for (const platform of requestData.platforms) {
    const platformConfig = config.platforms[platform];
    if (platformConfig) {
      const guidelines = [];
      if (platformConfig.style) guidelines.push(`Stil: ${platformConfig.style}`);
      if (platformConfig.focus) guidelines.push(`Fokus: ${platformConfig.focus}`);
      if (platformConfig.additionalGuidelines) guidelines.push(`Zusätzliche Richtlinien:\n${platformConfig.additionalGuidelines}`);

      if (guidelines.length > 0) {
        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
        platformGuidelines.push(`**${platformName}:**\n${guidelines.join('\n')}`);
      }
    }
  }

  return platformGuidelines.length > 0 ? platformGuidelines.join('\n\n') : null;
}

// Get task-specific instructions
function getTaskInstructions(config, requestData) {
  const parts = [];

  // Add base task instructions
  if (config.taskInstructions) {
    parts.push(SimpleTemplateEngine.render(config.taskInstructions, {
      ...requestData,
      config
    }));
  }

  // Add platform-specific guidelines
  const platformGuidelines = buildPlatformGuidelines(config, requestData);
  if (platformGuidelines) {
    parts.push(platformGuidelines);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

// Get output format instructions
function getOutputFormat(config, requestData) {
  if (!config.outputFormat) return null;
  return SimpleTemplateEngine.render(config.outputFormat, {
    ...requestData,
    config
  });
}

// Build constraints from platform guidelines
function buildConstraints(config, requestData) {
  const { platforms } = requestData;
  if (!platforms || !Array.isArray(platforms)) return null;

  const shortFormThreshold = config.shortFormThreshold || 300;
  const limits = [];

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

// Get AI options for request
function getAIOptions(config, requestData, typeConfig = null) {
  // For sharepic multi-type, get type-specific options
  if (config.types && !typeConfig) {
    const type = requestData.type || requestData.sharepicType || 'dreizeilen';
    typeConfig = config.types[type];
  }

  const baseOptions = typeConfig?.options || config.options || {};

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

// Main processor function
async function processGraphRequest(routeType, req, res) {
  return withErrorHandler(async (req, res) => {
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
      useAutomaticSearch
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
        knowledgeLength: extractedKnowledgeContent ? extractedKnowledgeContent.length : 0
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
      hasOtherData: Object.keys(requestData).length
    });

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

    // Apply profile defaults for optional fields (e.g., zitatgeber from display_name)
    await applyProfileDefaults(requestData, req, routeType);

    // Handle custom_generator special case
    let generatorData = null;
    if (config.features?.customPromptFromDb) {
      generatorData = await loadCustomGeneratorPrompt(requestData.slug);
      console.log(`[promptProcessor] Loaded generator: ${generatorData.name}`);
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
      req
    });

    // Update request content in enriched state (preserve original request with platforms)
    enrichedState.requestFormatted = requestContent;

    // Add tools if specified in config
    if (config.tools) {
      enrichedState.tools = config.tools;
    }

    // Assemble prompt using enriched state
    const promptResult = await assemblePromptGraphAsync(enrichedState);
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
        ...(enrichedState.enrichmentMetadata?.enableDocQnA ? { useDocumentQnA: true } : {})
      },
      metadata: {
        webSearchSources: enrichedState.enrichmentMetadata?.webSearchSources || null,
        platforms: requestData.platforms || null
      }
    };

    // Process AI request
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: routeType,
      usePrivacyMode: usePrivacyMode || false,
      useBedrock: requestData.useBedrock || false,
      ...payload
    }, req);

    if (!result.success) {
      console.error(`[promptProcessor] AI Worker error for ${routeType}:`, result.error);
      // Log failed generation
      logGeneration({
        userId: req.user?.id || req.session?.passport?.user?.id || null,
        generationType: routeType,
        platform: requestData.platforms?.[0] || null,
        tokensUsed: null,
        success: false
      });
      throw new Error(result.error);
    }

    // Log successful generation (fire-and-forget)
    logGeneration({
      userId: req.user?.id || req.session?.passport?.user?.id || null,
      generationType: routeType,
      platform: requestData.platforms?.[0] || null,
      tokensUsed: result.usage?.total_tokens || null,
      success: true
    });

    // Cache enriched context for future edit requests
    if (req.session?.id) {
      try {
        const { default: redisClient } = await import('../../utils/redisClient.js');
        const contextCacheKey = `edit_context:${req.session.id}:${routeType}`;

        const contextData = {
          originalRequest: requestData,
          enrichedState: {
            type: routeType,
            platforms: requestData.platforms || [],
            theme: requestData.theme || requestData.thema || requestData.details || null,
            urlsScraped: enrichedState.enrichmentMetadata?.urlsProcessed || [],
            documentsUsed: enrichedState.documents?.filter(d =>
              d.type === 'text' && d.source?.metadata?.contentSource === 'url_crawl'
            ).map(d => ({
              title: d.source.metadata?.title || 'Document',
              url: d.source.metadata?.url || null
            })) || [],
            docQnAUsed: enrichedState.enrichmentMetadata?.enableDocQnA || false,
            vectorSearchUsed: (selectedDocumentIds && selectedDocumentIds.length > 0) || false,
            webSearchUsed: enrichedState.enrichmentMetadata?.webSearchSources?.length > 0 || false
          },
          timestamp: Date.now()
        };

        // Cache for 1 hour
        await redisClient.setEx(contextCacheKey, 3600, JSON.stringify(contextData));
        console.log(`[promptProcessor] Cached edit context: ${contextCacheKey}`);
      } catch (cacheError) {
        // Don't fail the request if caching fails
        console.error('[promptProcessor] Failed to cache edit context:', cacheError.message);
      }
    }

    // Build enrichment summary for frontend
    const enrichmentSummary = {
      urlsScraped: enrichedState.enrichmentMetadata?.urlsProcessed?.length || 0,
      documentsProcessed: enrichedState.documents?.length || 0,
      docQnAUsed: enrichedState.enrichmentMetadata?.enableDocQnA || false,
      vectorSearchUsed: (selectedDocumentIds && selectedDocumentIds.length > 0) || false,
      webSearchUsed: enrichedState.enrichmentMetadata?.webSearchSources?.length > 0 || false,
      autoSearchUsed: enrichedState.enrichmentMetadata?.autoSearchUsed || false,
      autoSelectedDocuments: enrichedState.enrichmentMetadata?.autoSelectedDocuments || [],
      sources: [
        ...((enrichedState.enrichmentMetadata?.urlsProcessed || []).map(url => ({
          type: 'url',
          title: 'Gescrapte Website',
          url: url
        }))),
        ...((enrichedState.enrichmentMetadata?.webSearchSources || []).map(source => ({
          type: 'websearch',
          title: source.title || source.url,
          url: source.url
        }))),
        ...((enrichedState.enrichmentMetadata?.autoSelectedDocuments || []).map(doc => ({
          type: 'auto-document',
          title: doc.title,
          filename: doc.filename,
          relevance: doc.relevance_percent
        })))
      ]
    };

    // Send standardized success response
    sendSuccessResponseWithAttachments(
      res,
      result,
      `/${routeType}`,
      requestData,
      {
        hasAttachments: enrichedState.documents.length > 0,
        summary: { count: enrichedState.documents.length, totalSizeMB: 0 },
        enrichmentSummary
      },
      usePrivacyMode,
      provider
    );

  }, `/${routeType}`)(req, res);
}

// Export the main function and utilities
export { processGraphRequest, loadPromptConfig, SimpleTemplateEngine, buildSystemRole, buildRequestContent, buildWebSearchQuery, getFormattingInstructions, buildConstraints, getAIOptions, buildPlatformGuidelines, getTaskInstructions };