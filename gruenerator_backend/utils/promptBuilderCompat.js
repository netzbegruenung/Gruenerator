

const { PLATFORM_SPECIFIC_GUIDELINES, HTML_FORMATTING_INSTRUCTIONS, TITLE_GENERATION_INSTRUCTION, isStructuredPrompt, formatUserContent, processResponseWithTitle } = require('./promptUtils');

// Environment-based logging levels
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error
const isDebugMode = LOG_LEVEL === 'debug';
const isVerboseMode = ['debug', 'verbose'].includes(LOG_LEVEL);

/**
 * Unified Prompt Builder with Context-First Architecture and Examples Support
 * Builds prompts with clear hierarchy, protected constraints, and intelligent examples integration
 */
class UnifiedPromptBuilder {
  /**
   * Initialize prompt builder for specific content type
   * @param {string} type - Content type (social, antrag, universal, etc.)
   */
  constructor(type) {
    this.type = type;
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
      examples: [] // Examples support merged in
    };
    this.debug = false;
    
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
   * Build the final prompt structure optimized for Claude
   * @returns {Object} Prompt object with system message and user messages
   */
  build() {
    const result = {
      system: this._buildSystemMessage(),
      messages: this._buildUserMessages()
    };

    if (this.debug) {
      this._logDebugInfo(result);
    }

    return result;
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
   * Build the system message with role, constraints, and formatting
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

    const config = this.examplesConfig;
    let examplesText = '<examples>\nBEISPIELE ZUR ORIENTIERUNG:\n';
    examplesText += 'Diese Beispiele zeigen erfolgreiche Inhalte zu ähnlichen Themen. Nutze sie als Inspiration für Stil, Struktur und Tonfall.\n\n';

    this.context.examples.forEach((example, index) => {
      examplesText += `Beispiel ${index + 1}`;
      
      if (config.includeSimilarityInfo && example.similarity_score) {
        examplesText += ` (Relevanz: ${example.relevance})`;
      }
      
      examplesText += `:\n`;
      
      if (example.title) {
        examplesText += `Titel: ${example.title}\n`;
      }
      
      if (example.content) {
        examplesText += `Inhalt: ${example.content}\n`;
      }
      
      if (example.metadata && (example.metadata.tags.length > 0 || example.metadata.categories.length > 0)) {
        const tags = example.metadata.tags.slice(0, 5).join(', ');
        const categories = example.metadata.categories.slice(0, 3).join(', ');
        if (tags) examplesText += `Tags: ${tags}\n`;
        if (categories) examplesText += `Kategorien: ${categories}\n`;
      }
      
      examplesText += '\n';
    });

    examplesText += 'Nutze diese Beispiele als Orientierung, aber erstelle einzigartige, neue Inhalte.\n</examples>';
    
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
      console.log(`[PromptBuilder] ${this.type} prompt: ${result.system.length} chars system, ${result.messages.length} messages, ${this.context.examples.length} examples`);
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
 * @returns {Promise<UnifiedPromptBuilder>} The builder with examples added
 */
async function addExamplesFromService(builder, contentType, query, options = {}, req = null) {
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
        console.log(`  ${index + 1}. "${example.title}" (relevance: ${example.relevance || 'N/A'}, score: ${example.similarity_score?.toFixed(3) || 'N/A'})`);
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

// Export unified class with compatibility aliases
module.exports = {
  // Classes (both point to unified implementation)
  PromptBuilder: UnifiedPromptBuilder,
  PromptBuilderWithExamples: UnifiedPromptBuilder, // Alias for backward compatibility
  
  // Helper functions
  addExamplesFromService,
  
  // Re-export utilities from promptUtils for convenience
  HTML_FORMATTING_INSTRUCTIONS,
  PLATFORM_SPECIFIC_GUIDELINES,
  TITLE_GENERATION_INSTRUCTION,
  isStructuredPrompt,
  formatUserContent,
  processResponseWithTitle
};