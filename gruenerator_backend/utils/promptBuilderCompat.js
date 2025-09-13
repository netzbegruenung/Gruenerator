

const { PLATFORM_SPECIFIC_GUIDELINES, HTML_FORMATTING_INSTRUCTIONS, TITLE_GENERATION_INSTRUCTION, isStructuredPrompt, formatUserContent, processResponseWithTitle, WEB_SEARCH_TOOL } = require('./promptUtils');
const { assemblePromptGraph } = require('../agents/langgraph/promptAssemblyGraph.js');

// Environment-based logging levels
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error
const isDebugMode = LOG_LEVEL === 'debug';
const isVerboseMode = ['debug', 'verbose'].includes(LOG_LEVEL);

// Tool Registry - centralized tool definitions
const TOOL_REGISTRY = {
  webSearch: WEB_SEARCH_TOOL
  // Future tools can be added here (bundestagApi, vectorSearch, etc.)
};

/**
 * Unified Prompt Builder with Context-First Architecture and Examples Support
 * Builds prompts with clear hierarchy, protected constraints, and intelligent examples integration
 */
class UnifiedPromptBuilder {
  /**
   * Initialize prompt builder for specific content type
   * @param {string} type - Content type (social, antrag, universal, etc.)
   * @param {string} provider - AI provider ('claude', 'mistral', 'bedrock', etc.)
   */
  constructor(type, provider = 'claude') {
    this.type = type;
    this.provider = provider;
    this.context = {
      system: {
        role: null,
        constraints: null,
        formatting: null
      },
      documents: [],
      knowledge: [],
      instructions: null,
      request: null,
      examples: [], // Examples support merged in
      webSearchSources: [] // Store sources separately from content
    };
    this.debug = false;
    this.graphMode = process.env.PROMPT_BUILDER_GRAPH === '1';
    
    // Tool management
    this.tools = [];
    this.toolInstructions = new Map();
    
    // Examples configuration (from promptBuilderWithExamples.js)
    this.examplesConfig = {
      maxExamples: 5,
      maxCharactersPerExample: 500,
      includeSimilarityInfo: true,
      formatStyle: 'structured' // 'structured', 'inline', 'minimal'
    };
  }

  /**
   * Set the AI system role
   * @param {string} role - Clear role definition for the AI
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  setSystemRole(role) {
    this.context.system.role = role;
    return this;
  }

  /**
   * Set platform constraints (PROTECTED - cannot be overridden)
   * @param {Array|Object} platforms - Platform names or constraint object
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  setConstraints(platforms) {
    if (Array.isArray(platforms)) {
      // Generate constraints from platform array
      this.context.system.constraints = this._generatePlatformConstraints(platforms);
    } else if (typeof platforms === 'object') {
      // Use provided constraint object
      this.context.system.constraints = platforms;
    } else if (typeof platforms === 'string') {
      // Single constraint string
      this.context.system.constraints = platforms;
    }
    return this;
  }

  /**
   * Set formatting instructions
   * @param {string} formatting - Formatting requirements (HTML, Markdown, etc.)
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  setFormatting(formatting) {
    this.context.system.formatting = formatting;
    return this;
  }

  /**
   * Add documents as context (not instructions)
   * Documents provide background information but don't override constraints
   * @param {Array} documents - Array of document objects with type and source
   * @param {boolean} privacyMode - Whether privacy mode is active (affects PDF processing)
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  async addDocuments(documents, privacyMode = false) {
    if (Array.isArray(documents) && documents.length > 0) {
      if (privacyMode) {
        this.context.documents = await this.processDocumentsForPrivacy(documents);
      } else {
        this.context.documents = documents;
      }
    }
    return this;
  }

  /**
   * Add knowledge base content
   * @param {Array|string} knowledge - Knowledge content or array of knowledge items
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  addKnowledge(knowledge) {
    if (Array.isArray(knowledge)) {
      this.context.knowledge = knowledge;
    } else if (typeof knowledge === 'string' && knowledge.trim()) {
      this.context.knowledge = [knowledge];
    }
    return this;
  }

  /**
   * Add web search results as context
   * @param {Object} searchResults - Search results from web search service
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  addSearchResults(searchResults) {
    if (!searchResults || !searchResults.success) {
      return this;
    }

    // Check if we have either individual results or synthesized textContent
    const hasResults = searchResults.results && searchResults.results.length > 0;
    const hasTextContent = searchResults.textContent && searchResults.textContent.trim().length > 0;
    
    if (!hasResults && !hasTextContent) {
      return this;
    }

    // Format search results as knowledge context
    const searchContext = this._formatSearchResultsAsContext(searchResults);
    
    if (searchContext) {
      // Add to knowledge context
      if (!this.context.knowledge) {
        this.context.knowledge = [];
      }
      this.context.knowledge.push(searchContext);
    }

    return this;
  }

  /**
   * Handle web search - automatically performs search and adds results as context
   * @param {string} query - Search query
   * @param {string} agentType - Type of search agent ('withSources', 'withoutSources', 'news')
   * @param {Object} aiWorkerPool - AI worker pool instance for generating summaries
   * @returns {Promise<UnifiedPromptBuilder>} This instance for chaining
   */
  async handleWebSearch(query, agentType = 'withSources', aiWorkerPool = null) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      console.warn('[UnifiedPromptBuilder] Invalid search query provided to handleWebSearch');
      return this;
    }

    try {
      // Import and use SearXNGWebSearchService
      const searxngWebSearchService = require('../services/searxngWebSearchService');
      const searchService = searxngWebSearchService;
      
      const searchResults = await searchService.performWebSearch(query, agentType);
      
      if (searchResults && searchResults.success) {
        // Generate AI summary to get textContent for prompt context
        if (!aiWorkerPool) {
          console.warn('[UnifiedPromptBuilder] No aiWorkerPool provided to handleWebSearch - AI summary will be skipped');
        }
        
        const searchResultsWithSummary = aiWorkerPool 
          ? await searchService.generateAISummary(
              searchResults, 
              query, 
              aiWorkerPool,
              {},
              null // req parameter - using null since we're in prompt builder context
            )
          : searchResults;
        
        // Use the AI summary as textContent
        if (searchResultsWithSummary.summary && searchResultsWithSummary.summary.generated) {
          searchResults.textContent = searchResultsWithSummary.summary.text;
        }
        
        const hasResults = searchResults.results && searchResults.results.length > 0;
        const hasTextContent = searchResults.textContent && searchResults.textContent.trim().length > 0;
        const hasSources = searchResults.sources && searchResults.sources.length > 0;
        const contentLength = hasTextContent ? searchResults.textContent.trim().length : 0;
        const sourcesCount = searchResults.sourcesCount || 0;
        
        if (hasResults || hasTextContent) {
          // Get preview of first 2 sentences for logging
          const contentPreview = hasTextContent ? this._getContentPreview(searchResults.textContent, 2) : 'No text content';
          
          console.log(`[UnifiedPromptBuilder] Web search complete: Content added to context (${contentLength} chars${hasResults ? `, ${searchResults.results.length} individual results` : ''}${hasSources ? `, ${sourcesCount} sources captured` : ''})`);
          console.log(`[UnifiedPromptBuilder] Search result preview: ${contentPreview}`);
        } else {
          console.log(`[UnifiedPromptBuilder] Web search complete: No usable content found`);
        }
        
        // Store sources separately from content (for frontend display)
        if (hasSources) {
          this.context.webSearchSources = searchResults.sources;
          console.log(`[UnifiedPromptBuilder] Stored ${sourcesCount} sources separately for frontend display`);
        }
        
        // Add search results as context (only content, not sources)
        this.addSearchResults(searchResults);
        
        // Add instructions for using search results (but no tool)
        this.toolInstructions.set('webSearch', 
          'Nutze die bereitgestellten aktuellen Suchergebnisse für Informationen und Fakten. Zitiere Quellen wenn verfügbar.'
        );
      } else {
        console.warn('[UnifiedPromptBuilder] Web search returned no results');
        this._addSearchFailureNotice(query);
      }
      
    } catch (error) {
      console.error('[UnifiedPromptBuilder] Web search failed:', error.message);
      this._addSearchFailureNotice(query, error.message);
    }
    
    return this;
  }

  /**
   * Add search failure notice as knowledge
   * @private
   */
  _addSearchFailureNotice(query, errorMessage) {
    const notice = errorMessage 
      ? `HINWEIS: Die Websuche für aktuelle Informationen zu "${query}" konnte nicht durchgeführt werden (${errorMessage}). Verwende dein vorhandenes Wissen und weise darauf hin, dass die Informationen möglicherweise nicht ganz aktuell sind.`
      : `HINWEIS: Die Websuche für aktuelle Informationen zu "${query}" ergab keine Ergebnisse. Verwende dein vorhandenes Wissen und weise darauf hin, dass die Informationen möglicherweise nicht ganz aktuell sind.`;
    
    this.addKnowledge([notice]);
  }

  /**
   * Set user instructions (custom prompts)
   * @param {string} instructions - Custom user instructions
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  setInstructions(instructions) {
    if (typeof instructions === 'string' && instructions.trim()) {
      this.context.instructions = instructions.trim();
    }
    return this;
  }

  /**
   * Set the actual user request
   * @param {Object|string} request - User request data or string
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  setRequest(request) {
    this.context.request = request;
    return this;
  }

  /**
   * Add examples to the prompt with intelligent formatting
   * @param {Array} examples - Array of example objects from ContentExamplesService
   * @param {Object} options - Configuration options
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  addExamples(examples, options = {}) {
    if (!Array.isArray(examples) || examples.length === 0) {
      return this;
    }

    const config = { ...this.examplesConfig, ...options };
    
    // Limit number of examples
    const limitedExamples = examples.slice(0, config.maxExamples);
    
    // Process and format examples
    const processedExamples = limitedExamples.map(example => {
      return this._processExample(example, config);
    });

    this.context.examples = processedExamples;

    // Enhanced logging for examples
    this._logExampleDetails(processedExamples);

    return this;
  }

  /**
   * Configure examples formatting
   * @param {Object} config - Configuration object
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  configureExamples(config) {
    this.examplesConfig = { ...this.examplesConfig, ...config };
    return this;
  }

  /**
   * Enable debug mode for prompt inspection
   * @param {boolean} enabled - Whether to enable debug mode
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  enableDebug(enabled = true) {
    this.debug = enabled;
    return this;
  }

  /**
   * Switch to graph-style prompt assembly
   * @param {boolean} enabled
   * @returns {UnifiedPromptBuilder}
   */
  useGraphAssembly(enabled = true) {
    this.graphMode = !!enabled;
    return this;
  }

  /**
   * Enable a tool with optional system instructions
   * @param {string} toolName - Name of the tool (must exist in TOOL_REGISTRY)
   * @param {boolean} enabled - Whether to enable the tool
   * @param {string} systemInstructions - Optional instructions to add to system role
   * @param {Object} options - Additional options (e.g., forceDisableForBedrock)
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  enableTool(toolName, enabled = true, systemInstructions = null, options = {}) {
    if (!enabled) {
      // Remove tool if it exists
      this.tools = this.tools.filter(tool => tool.name !== (TOOL_REGISTRY[toolName]?.name || toolName));
      this.toolInstructions.delete(toolName);
      console.log(`[UnifiedPromptBuilder] Disabled tool: ${toolName}`);
      return this;
    }

    // Special handling for web search with Bedrock - disable tool but keep instructions
    if (toolName === 'webSearch' && options.forceDisableForBedrock) {
      console.log(`[UnifiedPromptBuilder] Web search disabled for Bedrock - results will be pre-fetched`);
      
      // Store instructions but don't add the tool
      if (systemInstructions) {
        const modifiedInstructions = systemInstructions.replace(
          'Nutze die Websuche für aktuelle Informationen',
          'Nutze die bereitgestellten Suchergebnisse für aktuelle Informationen'
        );
        this.toolInstructions.set(toolName, modifiedInstructions);
      }
      return this;
    }

    const tool = TOOL_REGISTRY[toolName];
    if (!tool) {
      console.warn(`[UnifiedPromptBuilder] Unknown tool: ${toolName}. Available tools:`, Object.keys(TOOL_REGISTRY));
      return this;
    }

    // Add tool if not already present, or replace if it exists
    const existingIndex = this.tools.findIndex(t => t.name === tool.name);
    if (existingIndex >= 0) {
      // Replace existing tool (in case of configuration updates)
      this.tools[existingIndex] = tool;
      console.log(`[UnifiedPromptBuilder] Updated tool: ${toolName}`);
    } else {
      this.tools.push(tool);
      console.log(`[UnifiedPromptBuilder] Enabled tool: ${toolName}`);
    }

    // Store system instructions if provided
    if (systemInstructions) {
      this.toolInstructions.set(toolName, systemInstructions);
    }

    return this;
  }

  /**
   * Set tools directly (for backward compatibility)
   * @param {Array} tools - Array of tool objects
   * @returns {UnifiedPromptBuilder} This instance for chaining
   */
  setTools(tools) {
    this.tools = Array.isArray(tools) ? [...tools] : [];
    return this;
  }

  /**
   * Build the final prompt structure optimized for the specified provider
   * @returns {Object} Prompt object with system message, user messages, and tools
   */
  build() {
    // Optional graph-style assembly (keeps return shape stable)
    if (this.graphMode) {
      const result = assemblePromptGraph({
        systemRole: this.context.system.role,
        constraints: this.context.system.constraints,
        formatting: this.context.system.formatting,
        documents: this.context.documents,
        knowledge: this.context.knowledge,
        instructions: this.context.instructions,
        request: this.context.request,
        examples: this.context.examples,
        tools: this.tools,
        toolInstructions: Array.from(this.toolInstructions.values()),
        provider: this.provider
      });
      if (this.debug) {
        this._logDebugInfo(result);
      }
      return this._adaptForProvider(result);
    }

    const baseResult = {
      system: this._buildSystemMessage(),
      messages: this._buildUserMessages(),
      tools: this.tools.length > 0 ? [...this.tools] : []
    };

    if (this.debug) {
      this._logDebugInfo(baseResult);
    }

    // Apply provider-specific adaptations
    return this._adaptForProvider(baseResult);
  }

  /**
   * Apply provider-specific adaptations to the prompt
   * @param {Object} result - Base prompt result
   * @returns {Object} Adapted prompt result
   * @private
   */
  _adaptForProvider(result) {
    switch(this.provider) {
      case 'mistral':
        return result; // Remove Mistral adaptations to shorten prompt
      case 'bedrock':
        return this._adaptForBedrock(result);
      case 'claude':
      default:
        return result; // Claude needs no adaptation
    }
  }

  /**
   * Adapt prompt for Mistral with stronger reinforcement
   * @param {Object} result - Base prompt result
   * @returns {Object} Mistral-adapted prompt result
   * @private
   */
  _adaptForMistral(result) {
    const { messages, system } = result;
    
    if (messages.length === 0) {
      return result;
    }

    // Extract constraints from system message
    const constraints = this._extractConstraints(system);
    
    // Get the last user message for reinforcement
    const lastUserMsgIndex = messages.length - 1;
    const lastUserMsg = messages[lastUserMsgIndex];
    
    if (lastUserMsg && lastUserMsg.role === 'user') {
      // Add Mistral-specific reinforcement
      const reinforcement = this._buildMistralReinforcement(constraints);
      
      if (reinforcement) {
        lastUserMsg.content = reinforcement + lastUserMsg.content;
        console.log(`[PromptBuilder] Applied Mistral adaptations for ${this.type}`);
      }
    }

    return result;
  }

  /**
   * Adapt prompt for Bedrock (placeholder for future implementation)
   * @param {Object} result - Base prompt result
   * @returns {Object} Bedrock-adapted prompt result
   * @private
   */
  _adaptForBedrock(result) {
    // Future implementation for Bedrock-specific adaptations
    return result;
  }

  /**
   * Extract platform constraints from system message
   * @param {string} systemMessage - System message text
   * @returns {Array} Array of constraint information
   * @private
   */
  _extractConstraints(systemMessage) {
    const constraints = [];
    
    // Extract platform-specific constraints
    const platformConstraints = systemMessage.match(/WICHTIG:.*?einzuhalten\./g);
    if (platformConstraints) {
      constraints.push(...platformConstraints);
    }
    
    // Extract character limits
    const characterLimits = systemMessage.match(/maximal \d+ Zeichen/g);
    if (characterLimits) {
      constraints.push(...characterLimits);
    }
    
    return constraints;
  }

  /**
   * Build Mistral-specific reinforcement based on constraints
   * @param {Array} constraints - Array of constraint strings
   * @returns {string} Reinforcement text to prepend to user message
   * @private
   */
  _buildMistralReinforcement(constraints) {
    if (constraints.length === 0) {
      return '';
    }

    let reinforcement = '\n\n=== STRICT REQUIREMENTS FOR MISTRAL ===\n';
    
    // Add all constraints as mandatory requirements
    constraints.forEach(constraint => {
      const cleaned = constraint.replace('WICHTIG:', 'MANDATORY:');
      reinforcement += `• ${cleaned}\n`;
    });
    
    reinforcement += '\n=== END REQUIREMENTS ===\n\nRequest:\n';
    
    return reinforcement;
  }

  /**
   * Process a single example
   * @private
   */
  _processExample(example, config) {
    const processed = {
      id: example.id,
      type: example.type,
      content: this._truncateContent(example.content, config.maxCharactersPerExample),
      title: example.title
    };

    if (config.includeSimilarityInfo && example.similarity_score) {
      processed.relevance = this._getRelevanceLabel(example.similarity_score);
      processed.similarity_score = example.similarity_score;
    }

    if (example.metadata) {
      processed.metadata = {
        categories: example.metadata.categories || [],
        tags: example.metadata.tags || []
      };
    }

    return processed;
  }

  /**
   * Simplified logging for examples
   * @private
   */
  _logExampleDetails(examples) {
    // Environment-based example logging
    if (isVerboseMode && examples && examples.length > 0) {
      console.log(`[PromptBuilder] Added ${examples.length} examples`);
    }
  }

  /**
   * Format search results as context string - optimized for maximum content, minimum tokens
   * @private
   */
  _formatSearchResultsAsContext(searchResults) {
    if (!searchResults.textContent || !searchResults.textContent.trim()) {
      return null;
    }

    // Return only the actual content from Mistral's synthesis - no structure, no URLs, no metadata
    return `AKTUELLE INFORMATIONEN:\n${searchResults.textContent.trim()}`;
  }

  /**
   * Get content preview with first N sentences
   * @private
   */
  _getContentPreview(content, sentences = 2) {
    if (!content) return 'No content';
    
    // Split by sentences (period, exclamation, question mark)
    const sentenceEnders = /[.!?]+/g;
    const parts = content.split(sentenceEnders);
    
    if (parts.length >= sentences) {
      // Take first N sentence parts and rejoin
      const preview = parts.slice(0, sentences).join('. ').trim();
      return preview.length > 150 ? preview.substring(0, 147) + '...' : preview + '.';
    }
    
    // Fallback to character limit if not enough sentences
    return content.length > 150 ? content.substring(0, 147) + '...' : content;
  }

  /**
   * Truncate content to maximum length
   * @private
   */
  _truncateContent(content, maxLength) {
    if (!content || content.length <= maxLength) {
      return content;
    }
    
    // Smart truncation at sentence boundary
    const truncated = content.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastExclamation = truncated.lastIndexOf('!');
    const lastQuestion = truncated.lastIndexOf('?');
    
    const lastSentence = Math.max(lastPeriod, lastExclamation, lastQuestion);
    
    if (lastSentence > maxLength * 0.8) {
      // If we found a sentence ending near the end, use it
      return truncated.substring(0, lastSentence + 1);
    } else {
      // Otherwise, truncate at word boundary
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.8) {
        return truncated.substring(0, lastSpace) + '...';
      }
      return truncated + '...';
    }
  }

  /**
   * Get human-readable relevance label based on similarity score
   * @private
   */
  _getRelevanceLabel(score) {
    if (score >= 0.8) return 'very_high';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    if (score >= 0.3) return 'low';
    return 'very_low';
  }

  /**
   * Generate platform-specific constraints from platform array
   * @private
   */
  _generatePlatformConstraints(platforms) {
    if (!Array.isArray(platforms) || platforms.length === 0) {
      return null;
    }

    const constraints = [];
    const SHORT_FORM_THRESHOLD = 300; // Characters

    for (const platform of platforms) {
      const guidelines = PLATFORM_SPECIFIC_GUIDELINES[platform];
      if (guidelines && guidelines.maxLength <= SHORT_FORM_THRESHOLD) {
        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
        constraints.push(`${platformName}: maximal ${guidelines.maxLength} Zeichen`);
      }
    }

    if (constraints.length > 0) {
      return `WICHTIG: ${constraints.join(', ')} - diese Grenzen sind absolut einzuhalten.`;
    }

    return null;
  }

  /**
   * Build the system message with role, constraints, formatting, and tool instructions
   * @private
   */
  _buildSystemMessage() {
    const parts = [];

    // Role is required
    if (this.context.system.role) {
      parts.push(this.context.system.role);
    } else {
      throw new Error('System role is required - call setSystemRole()');
    }

    // Add tool instructions if any tools are enabled
    if (this.toolInstructions.size > 0) {
      const toolInstructionsList = Array.from(this.toolInstructions.values());
      parts.push(`\n${toolInstructionsList.join(' ')}`);
    }

    // Add constraints if present (HIGHEST PRIORITY)
    if (this.context.system.constraints) {
      parts.push(`\n${this.context.system.constraints}`);
    }

    // Add formatting instructions if present
    if (this.context.system.formatting) {
      parts.push(`\n${this.context.system.formatting}`);
    }

    return parts.join('');
  }

  /**
   * Build user messages following Claude best practices
   * @private
   */
  _buildUserMessages() {
    const messages = [];

    // 1. Documents first (if present) - Claude processes these as context
    if (this.context.documents.length > 0) {
      messages.push({
        role: 'user',
        content: this._buildDocumentContent()
      });
    }

    // 2. Main user message with examples, knowledge, instructions, and request
    const userContent = this._buildMainUserContent();
    if (userContent) {
      messages.push({
        role: 'user',
        content: userContent
      });
    }

    return messages;
  }

  /**
   * Build document content for Claude API
   * @private
   */
  _buildDocumentContent() {
    const contentBlocks = [];

    // Add text introduction for documents
    contentBlocks.push({
      type: 'text',
      text: 'Hier sind Dokumente als Hintergrundinformation:'
    });

    // Add each document
    for (const doc of this.context.documents) {
      if (doc.type === 'document' && doc.source) {
        contentBlocks.push({
          type: 'document',
          source: doc.source
        });
      } else if (doc.type === 'image' && doc.source) {
        contentBlocks.push({
          type: 'image',
          source: doc.source
        });
      } else if (doc.type === 'text' && doc.source) {
        // Handle text documents (extracted PDFs in privacy mode)
        contentBlocks.push({
          type: 'text',
          text: doc.source.text
        });
      }
    }

    return contentBlocks;
  }

  /**
   * Build main user content with examples, knowledge, instructions, and request
   * @private
   */
  _buildMainUserContent() {
    const parts = [];

    // Add examples first (if present)
    if (this.context.examples.length > 0) {
      parts.push(this._formatExamplesForPrompt());
    }

    // Add knowledge base content
    if (this.context.knowledge.length > 0) {
      parts.push(`<knowledge>\n${this.context.knowledge.join('\n\n')}\n</knowledge>`);
    }

    // Add custom instructions
    if (this.context.instructions) {
      parts.push(`<instructions>\n${this.context.instructions}\n</instructions>`);
    }

    // Add the actual request
    if (this.context.request) {
      let requestText;
      if (typeof this.context.request === 'string') {
        requestText = this.context.request;
      } else {
        // Format object as request text
        requestText = this._formatRequestObject(this.context.request);
      }
      parts.push(`<request>\n${requestText}\n</request>`);
    }

    return parts.length > 0 ? parts.join('\n\n---\n\n') : null;
  }

  /**
   * Format examples for inclusion in the prompt
   * @private
   */
  _formatExamplesForPrompt() {
    if (this.context.examples.length === 0) {
      return '';
    }

    let examplesText = '<examples>\nBEISPIEL:\n';

    this.context.examples.forEach((example, index) => {
      if (example.content) {
        examplesText += `${example.content}\n`;
      }
    });

    examplesText += '</examples>';
    
    return examplesText;
  }

  /**
   * Format request object into readable text
   * @private
   */
  _formatRequestObject(request) {
    const parts = [];

    if (request.theme || request.thema) {
      parts.push(`Thema: ${request.theme || request.thema}`);
    }

    if (request.details) {
      parts.push(`Details: ${request.details}`);
    }

    if (request.platforms && Array.isArray(request.platforms)) {
      parts.push(`Plattformen: ${request.platforms.join(', ')}`);
    }

    if (request.zitatgeber) {
      parts.push(`Zitatgeber: ${request.zitatgeber}`);
    }

    if (request.textForm) {
      parts.push(`Textform: ${request.textForm}`);
    }

    // Add any other properties
    for (const [key, value] of Object.entries(request)) {
      if (!['theme', 'thema', 'details', 'platforms', 'zitatgeber', 'textForm'].includes(key) && value) {
        parts.push(`${key}: ${value}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Log debug information about the built prompt (simplified)
   * @private
   */
  _logDebugInfo(result) {
    // Environment-based logging
    if (isVerboseMode) {
      const toolNames = this.tools.map(t => t.name).join(', ');
      console.log(`[PromptBuilder] ${this.type} prompt: ${result.system.length} chars system, ${result.messages.length} messages, ${this.context.examples.length} examples, ${this.tools.length} tools${toolNames ? ` (${toolNames})` : ''}`);
    }
  }

  /**
   * Process documents for privacy mode - extract text from PDFs
   * @private
   * @param {Array} documents - Array of document objects
   * @returns {Promise<Array>} Processed documents array
   */
  async processDocumentsForPrivacy(documents) {
    const processedDocs = [];
    
    for (const doc of documents) {
      if (doc.type === 'document' && doc.source?.media_type === 'application/pdf') {
        try {
          console.log(`[PromptBuilder] Processing PDF for privacy mode: ${doc.source.name || 'unknown'}`);
          
          // Safe dynamic import with error boundaries
          let ocrService;
          try {
            const ocrModule = await import('../services/ocrService.js');
            ocrService = ocrModule.ocrService;
            
            if (!ocrService || typeof ocrService.extractTextFromBase64PDF !== 'function') {
              throw new Error('OCR service not properly initialized');
            }
          } catch (importError) {
            console.error('[PromptBuilder] Failed to import OCR service:', importError.message);
            throw new Error('OCR service unavailable');
          }
          
          // Extract text from PDF using base64 data
          const result = await ocrService.extractTextFromBase64PDF(
            doc.source.data, 
            doc.source.name || 'unknown.pdf'
          );
          
          // Transform to text document for privacy providers
          processedDocs.push({
            type: 'text',
            source: {
              type: 'text',
              text: `PDF-Inhalt: ${doc.source.name || 'Unbekannt'}\n\n${result.text}`,
              metadata: {
                originalType: 'pdf',
                filename: doc.source.name,
                pageCount: result.pageCount,
                extractionMethod: result.method,
                processingTime: result.processingTime
              }
            }
          });
          
          console.log(`[PromptBuilder] PDF processed for privacy mode: ${result.pageCount} pages, ${result.text.length} chars, method: ${result.method}`);
          
        } catch (error) {
          console.error(`[PromptBuilder] Failed to extract PDF text for privacy mode:`, error);
          // Fallback: skip the PDF with error notice
          processedDocs.push({
            type: 'text',
            source: {
              type: 'text',
              text: `PDF-Verarbeitung fehlgeschlagen: ${doc.source.name || 'Unbekannt'}\nFehler: ${error.message}`,
              metadata: {
                originalType: 'pdf',
                filename: doc.source.name,
                error: true
              }
            }
          });
        }
      } else {
        // Keep non-PDF documents as-is (images, etc.)
        processedDocs.push(doc);
      }
    }
    
    return processedDocs;
  }

  /**
   * Get web search sources (if any) for frontend display
   * @returns {Array} Array of source objects
   */
  getWebSearchSources() {
    return this.context.webSearchSources || [];
  }

  /**
   * Get the current context for inspection
   * @returns {Object} Current context object
   */
  getContext() {
    return { ...this.context };
  }

  /**
   * Validate that required context is present
   * @returns {boolean} True if valid, throws error if not
   */
  validate() {
    if (!this.context.system.role) {
      throw new Error('System role is required');
    }

    if (!this.context.request) {
      throw new Error('Request is required');
    }

    return true;
  }
}

/**
 * Helper function to add examples from ContentExamplesService
 * @param {UnifiedPromptBuilder} builder - The prompt builder instance
 * @param {string} contentType - Type of content to fetch examples for
 * @param {string} query - Search query for finding relevant examples
 * @param {Object} options - Additional options
 * @param {Object} req - Express request object (for AI worker access)
 * @param {string} routeType - The route type (e.g., 'press/social') for validation
 * @param {Array} platforms - Array of platform names for validation
 * @returns {Promise<UnifiedPromptBuilder>} The builder with examples added
 */
async function addExamplesFromService(builder, contentType, query, options = {}, req = null, routeType = null, platforms = []) {
  // Validate if examples should be used for this route and platform combination
  if (routeType && platforms.length > 0) {
    if (!shouldUseExamples(routeType, platforms)) {
      console.log(`[addExamplesFromService] Skipping examples for route "${routeType}" with platforms [${platforms.join(', ')}] - not configured for examples`);
      return builder;
    }
  }
  
  try {
    // Safe dynamic import with error boundaries
    let contentExamplesService;
    try {
      const examplesModule = await import('../services/contentExamplesService.js');
      contentExamplesService = examplesModule.contentExamplesService;
      
      if (!contentExamplesService || typeof contentExamplesService.getExamples !== 'function') {
        throw new Error('Content examples service not properly initialized');
      }
    } catch (importError) {
      console.error('[addExamplesFromService] Failed to import content examples service:', importError.message);
      console.log('[addExamplesFromService] Continuing without examples due to service unavailability');
      return builder; // Return builder without examples rather than failing
    }
    
    const examples = await contentExamplesService.getExamples(contentType, query, {
      limit: options.limit || 3,
      useCache: options.useCache !== false,
      includeMetadata: true
    }, req);

    if (examples && examples.length > 0) {
      console.log(`[addExamplesFromService] Found ${examples.length} examples for ${contentType} with query: "${query}"`);
      examples.forEach((example, index) => {
        // Use title if available, otherwise use content preview
        const displayText = example.title || (example.content ? example.content.substring(0, 50) + '...' : 'No content');
        console.log(`  ${index + 1}. "${displayText}" (relevance: ${example.relevance || 'N/A'}, score: ${example.similarity_score?.toFixed(3) || 'N/A'})`);
      });
      
      builder.addExamples(examples, {
        formatStyle: options.formatStyle || 'structured',
        maxCharactersPerExample: options.maxCharactersPerExample || 500,
        includeSimilarityInfo: true  // Enable relevance labels for examples
      });
    } else {
      console.log(`[addExamplesFromService] No examples found for ${contentType} with query: "${query}"`);
    }
    
    return builder;
  } catch (error) {
    console.error(`[addExamplesFromService] Error fetching examples for ${contentType}:`, error);
    return builder; // Return builder even on error to not break the chain
  }
}

// Configuration for which routes and platforms should use examples
const EXAMPLES_CONFIG = {
  // Route patterns and their allowed platforms for examples
  'press/social': ['instagram', 'facebook'],
  // Future routes can be easily added here:
  // 'campaign/ads': ['instagram', 'facebook', 'twitter'],
  // 'press/newsletter': ['email']
};

/**
 * Check if examples should be used for the given route and platforms
 * @param {string} routeType - The route type (e.g., 'press/social')
 * @param {Array} platforms - Array of platform names
 * @returns {boolean} True if examples should be used
 */
function shouldUseExamples(routeType, platforms = []) {
  const allowedPlatforms = EXAMPLES_CONFIG[routeType];
  if (!allowedPlatforms) {
    return false;
  }
  
  // Check if any of the requested platforms are in the allowed list
  return platforms.some(platform => allowedPlatforms.includes(platform));
}

// Export unified class with compatibility aliases
module.exports = {
  // Classes (both point to unified implementation)
  PromptBuilder: UnifiedPromptBuilder,
  PromptBuilderWithExamples: UnifiedPromptBuilder, // Alias for backward compatibility
  
  // Helper functions
  addExamplesFromService,
  shouldUseExamples,
  
  // Re-export utilities from promptUtils for convenience
  HTML_FORMATTING_INSTRUCTIONS,
  PLATFORM_SPECIFIC_GUIDELINES,
  TITLE_GENERATION_INSTRUCTION,
  isStructuredPrompt,
  formatUserContent,
  processResponseWithTitle
};
