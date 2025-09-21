const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

// Import required utilities
const { enrichRequest } = require('../../utils/requestEnrichment');
const { assemblePromptGraphAsync } = require('./promptAssemblyGraph.js');
const { sendSuccessResponseWithAttachments } = require('../../utils/responseFormatter');
const { withErrorHandler, handleValidationError } = require('../../utils/errorHandler');
const {
  MARKDOWN_FORMATTING_INSTRUCTIONS,
  HTML_FORMATTING_INSTRUCTIONS,
  TITLE_GENERATION_INSTRUCTION,
  PLATFORM_SPECIFIC_GUIDELINES
} = require('../../utils/promptUtils');
const { localizePromptObject, extractLocaleFromRequest } = require('../../utils/localizationHelper');

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

// Build system role with extensions
function buildSystemRole(config, requestData, generatorData = null) {
  // Handle sharepic multi-type case
  if (config.types) {
    const type = requestData.type || requestData.sharepicType || 'dreizeilen';
    const typeConfig = config.types[type];
    if (typeConfig?.systemRole) {
      return typeConfig.systemRole;
    }
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

  // Add bundestagApi instructions if applicable
  if (config.features?.bundestagApi && requestData.useBundestagApi) {
    systemRole += ' ' + config.features.bundestagApiInstructions;
  }

  // Add platform-specific style guidelines
  if (requestData.platforms && Array.isArray(requestData.platforms) && config.platforms) {
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
          platformGuidelines.push(`\n\n**${platformName}:**\n${guidelines.join('\n')}`);
        }
      }
    }
    if (platformGuidelines.length > 0) {
      systemRole += platformGuidelines.join('');
    }
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

    for (const [key, value] of Object.entries(cleanFormData)) {
      const placeholder = `{{${key}}}`;
      processedPrompt = processedPrompt.replace(new RegExp(placeholder, 'g'), value || '');
    }

    return SimpleTemplateEngine.render(config.requestTemplate, {
      processedPrompt,
      formDataFields: Object.entries(cleanFormData).map(([key, value]) => ({ key, value })),
      generatorName: generatorData.name
    });
  }

  // Handle sharepic multi-type case
  if (config.types) {
    const type = requestData.type || requestData.sharepicType || 'dreizeilen'; // Default to dreizeilen
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
      selectedKnowledgeIds,
      selectedDocumentIds,
      selectedTextIds,
      searchQuery
    } = requestData;

    console.log(`[promptProcessor] Processing ${routeType} request`);
    console.log(`[promptProcessor] Request data:`, {
      useBedrock: requestData.useBedrock,
      usePrivacyMode: requestData.usePrivacyMode,
      provider: requestData.provider,
      hasCustomPrompt: !!customPrompt,
      hasKnowledgeContent: !!knowledgeContent,
      hasSelectedKnowledge: !!(selectedKnowledgeIds && selectedKnowledgeIds.length > 0),
      hasSelectedDocuments: !!(selectedDocumentIds && selectedDocumentIds.length > 0),
      hasSelectedTexts: !!(selectedTextIds && selectedTextIds.length > 0),
      hasSearchQuery: !!searchQuery,
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

    // Build web search query
    const webSearchQuery = buildWebSearchQuery(config, requestData);

    // Use unified enrichment service
    const enrichedState = await enrichRequest(requestData, {
      type: routeType,
      enableUrls: config.features?.urlCrawl !== false,
      enableWebSearch: !!webSearchQuery,
      enableDocQnA: config.features?.docQnA !== false,
      usePrivacyMode: usePrivacyMode || false,
      webSearchQuery,
      systemRole,
      constraints,
      formatting,
      instructions: customPrompt || null,
      knowledgeContent: knowledgeContent || null,
      selectedKnowledgeIds: selectedKnowledgeIds || [],
      selectedDocumentIds: selectedDocumentIds || [],
      selectedTextIds: selectedTextIds || [],
      searchQuery: searchQuery || null,
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
      throw new Error(result.error);
    }

    // Send standardized success response
    sendSuccessResponseWithAttachments(
      res,
      result,
      `/${routeType}`,
      requestData,
      {
        hasAttachments: enrichedState.documents.length > 0,
        summary: { count: enrichedState.documents.length, totalSizeMB: 0 }
      },
      usePrivacyMode,
      provider
    );

  }, `/${routeType}`)(req, res);
}

// Export the main function and utilities
module.exports = {
  processGraphRequest,
  loadPromptConfig,
  SimpleTemplateEngine,
  buildSystemRole,
  buildRequestContent,
  buildWebSearchQuery,
  getFormattingInstructions,
  buildConstraints,
  getAIOptions
};