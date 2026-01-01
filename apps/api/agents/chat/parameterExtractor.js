/**
 * Parameter Extractor for Grünerator Chat
 * Extracts relevant parameters from user messages for different agents using Mistral AI
 */

import mistralClient from '../../workers/mistralClient.js';

/**
 * Extract parameters from user message based on target agent using Mistral AI
 * @param {string} message - User's message
 * @param {string} agent - Target agent name
 * @param {object} context - Chat context
 * @returns {object} Extracted parameters
 */
async function extractParameters(message, agent, context = {}) {
  console.log('[ParameterExtractor] Extracting parameters for agent:', agent);

  const baseParams = {
    originalMessage: message,
    chatContext: context
  };

  // For sharepic agents (especially zitat), use Mistral AI for better extraction
  if (['zitat', 'info', 'headline', 'dreizeilen'].includes(agent)) {
    try {
      const mistralParams = await extractParametersWithMistral(message, agent, context);
      return { ...baseParams, ...mistralParams };
    } catch (error) {
      console.error('[ParameterExtractor] Mistral extraction failed, falling back to regex:', error);
      // Fall back to regex-based extraction
      return extractSharepicParams(message, context, baseParams, agent);
    }
  }

  // Agent-specific parameter extraction (existing logic for non-sharepic agents)
  switch (agent) {
    case 'social_media':
    case 'pressemitteilung':
      return extractSocialParams(message, context, baseParams);

    case 'antrag':
    case 'kleine_anfrage':
    case 'grosse_anfrage':
      return extractAntragParams(message, context, baseParams);

    case 'gruene_jugend':
      return extractGrueneJugendParams(message, context, baseParams);

    case 'leichte_sprache':
      return extractLeichteSpracheParams(message, context, baseParams);

    case 'imagine':
      return extractImagineParams(message, context, baseParams);

    case 'universal':
    default:
      return extractUniversalParams(message, context, baseParams);
  }
}

/**
 * Extract parameters using Mistral AI for better semantic understanding
 * @param {string} message - User's message
 * @param {string} agent - Target agent name
 * @param {object} context - Chat context
 * @returns {object} Extracted parameters
 */
async function extractParametersWithMistral(message, agent, context = {}) {
  const prompt = createExtractionPrompt(message, agent, context);

  console.log('[ParameterExtractor] Using Mistral for parameter extraction:', agent);

  const response = await mistralClient.chat.complete({
    model: 'mistral-small-latest',
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.1,
    max_tokens: 500
  });

  let responseText = response.choices[0].message.content.trim();

  // Remove markdown code blocks if present
  if (responseText.startsWith('```json')) {
    responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (responseText.startsWith('```')) {
    responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const extracted = JSON.parse(responseText);
    console.log('[ParameterExtractor] Mistral extraction successful:', extracted);

    // Add confidence metadata in the expected format
    const result = {
      thema: extracted.theme || 'Grüne Politik',
      details: extracted.details || message,
      type: agent,
      _parameterConfidence: {},
      _parameterSources: {}
    };

    // Add agent-specific fields
    if (agent === 'zitat' && extracted.author) {
      result.name = extracted.author;
      result._parameterConfidence.name = extracted.confidence?.author || 0.9;
      result._parameterSources.name = 'mistral_ai';
    }

    if (agent === 'dreizeilen' && extracted.lines) {
      result.line1 = extracted.lines.line1;
      result.line2 = extracted.lines.line2;
      result.line3 = extracted.lines.line3;
    }

    return result;

  } catch (parseError) {
    console.error('[ParameterExtractor] Failed to parse Mistral response:', parseError);
    console.error('[ParameterExtractor] Raw response:', responseText);
    throw new Error('Invalid JSON response from Mistral');
  }
}

/**
 * Create extraction prompt for Mistral based on agent type
 * @param {string} message - User's message
 * @param {string} agent - Target agent name
 * @param {object} context - Chat context
 * @returns {string} Prompt for Mistral
 */
function createExtractionPrompt(message, agent, context) {
  const basePrompt = `Extrahiere Parameter aus dieser deutschen Nachricht für die Erstellung eines ${agent}-Sharepics.

Nachricht: "${message}"

`;

  let specificInstructions = '';

  switch (agent) {
    case 'zitat':
      specificInstructions = `Extrahiere:
- author: Name der Person (z.B. "von Hans Müller" → "Hans Müller")
- theme: Hauptthema des Zitats
- details: Zusätzliche Details oder Kontext

Beispiele:
- "Zitat von Angela Merkel über Klimaschutz" → author: "Angela Merkel", theme: "Klimaschutz"
- "das zitat ist von moritz wächter und soll zu klimaschutz sein" → author: "Moritz Wächter", theme: "Klimaschutz"`;
      break;

    case 'info':
    case 'headline':
      specificInstructions = `Extrahiere:
- theme: Hauptthema des Sharepics
- details: Zusätzliche Informationen oder gewünschter Inhalt`;
      break;

    case 'dreizeilen':
      specificInstructions = `Extrahiere:
- theme: Hauptthema
- details: Zusätzliche Details
- lines: Falls spezifische Zeilen angegeben (line1, line2, line3)`;
      break;
  }

  return basePrompt + specificInstructions + `

Antworte nur mit gültigem JSON in diesem Format:
{
  "author": "Name oder null",
  "theme": "Hauptthema",
  "details": "Zusätzliche Details",
  "confidence": {
    "author": 0.0-1.0,
    "theme": 0.0-1.0
  }
}`;
}

/**
 * Extract parameters for social media and press release agents
 */
function extractSocialParams(message, context, baseParams) {
  const thema = extractTheme(message, context);
  const details = extractDetails(message, thema);
  const platforms = extractPlatforms(message);

  return {
    ...baseParams,
    thema: thema || 'Politisches Thema',
    details: details || message,
    platforms: platforms.length > 0 ? platforms : ['facebook'], // Default platform
    was: null, // For press releases
    wie: null,
    zitatgeber: extractQuoteAuthor(message)
  };
}

/**
 * Extract parameters for proposal/inquiry agents
 */
function extractAntragParams(message, context, baseParams) {
  const idee = extractTheme(message, context) || message;
  const details = extractDetails(message, idee);
  const gliederung = extractStructure(message);

  return {
    ...baseParams,
    idee,
    details,
    gliederung,
    requestType: determineRequestType(message)
  };
}

/**
 * Extract parameters for Grüne Jugend agent
 */
function extractGrueneJugendParams(message, context, baseParams) {
  const thema = extractTheme(message, context);
  const details = extractDetails(message, thema);
  const platforms = extractPlatforms(message);

  return {
    ...baseParams,
    thema: thema || 'Aktivismus und Politik',
    details: details || message,
    platforms: platforms.length > 0 ? platforms : ['instagram', 'twitter'] // Default youth platforms
  };
}

/**
 * Extract parameters for Leichte Sprache agent
 */
function extractLeichteSpracheParams(message, context, baseParams) {
  // For simple language, the original text to translate is key
  let originalText = message;

  // Check if user is referring to previous content
  if (context.lastGeneratedText &&
      (message.includes('das') || message.includes('daraus') || message.includes('übersetze'))) {
    originalText = context.lastGeneratedText;
  }

  return {
    ...baseParams,
    originalText,
    targetLanguage: 'Leichte Sprache'
  };
}

/**
 * Extract parameters for sharepic agents
 */
function extractSharepicParams(message, context, baseParams, agent) {
  const thema = extractTheme(message, context);
  const details = extractDetails(message, thema);

  // Base parameters for all sharepic types
  const params = {
    ...baseParams,
    thema: thema || 'Grüne Politik',
    details: details || message,
    type: agent
  };

  // Agent-specific additions
  switch (agent) {
    case 'zitat':
      const authorResult = extractQuoteAuthor(message);
      params.name = authorResult.value || 'Unbekannt';
      params._parameterConfidence = params._parameterConfidence || {};
      params._parameterConfidence.name = authorResult.confidence;
      params._parameterSources = params._parameterSources || {};
      params._parameterSources.name = authorResult.source;
      break;

    case 'dreizeilen':
      // Check if user provided specific lines
      const lines = extractLines(message);
      if (lines) {
        params.line1 = lines.line1;
        params.line2 = lines.line2;
        params.line3 = lines.line3;
      }
      break;

    case 'info':
    case 'headline':
    default:
      // Use base parameters
      break;
  }

  return params;
}

/**
 * Extract parameters for universal agent
 */
function extractUniversalParams(message, context, baseParams) {
  const textForm = extractTextForm(message);
  const sprache = extractStyle(message);
  const thema = extractTheme(message, context);
  const details = extractDetails(message, thema);

  return {
    ...baseParams,
    textForm: textForm || 'Allgemeiner Text',
    sprache: sprache || 'Sachlich und informativ',
    thema: thema || 'Politisches Thema',
    details: details || message
  };
}

/**
 * Variant keyword mapping for imagine agent
 */
const IMAGINE_VARIANT_KEYWORDS = {
  'illustration': 'illustration-pure',
  'zeichnung': 'illustration-pure',
  'aquarell': 'illustration-pure',
  'malerisch': 'illustration-pure',
  'realistisch': 'realistic-pure',
  'foto': 'realistic-pure',
  'fotorealistisch': 'realistic-pure',
  'photorealistisch': 'realistic-pure',
  'pixel': 'pixel-pure',
  'retro': 'pixel-pure',
  'pixelart': 'pixel-pure',
  '16-bit': 'pixel-pure',
  'editorial': 'editorial-pure',
  'magazin': 'editorial-pure'
};

/**
 * Extract parameters for imagine agent (FLUX image generation)
 * Detects mode (pure, sharepic, edit), subject, variant, and title
 */
function extractImagineParams(message, context, baseParams) {
  const normalizedMessage = message.toLowerCase();

  // Detect imagine mode based on context and keywords
  const mode = detectImagineMode(normalizedMessage, context);

  // Extract subject (what to generate)
  const subject = extractImagineSubject(message, mode);

  // Extract variant/style
  const variantResult = extractImagineVariant(normalizedMessage);

  // Extract title (for sharepic mode)
  const title = mode === 'sharepic' ? extractImagineTitle(message) : null;

  // Extract action (for edit mode)
  const action = mode === 'edit' ? extractEditAction(message) : null;

  console.log('[ParameterExtractor] Imagine params:', {
    mode,
    subject: subject?.substring(0, 50),
    variant: variantResult.variant,
    hasExplicitVariant: variantResult.explicit,
    title,
    action
  });

  return {
    ...baseParams,
    mode,
    subject: subject || 'Ein Bild',
    variant: variantResult.variant,
    title,
    action,
    _needsVariantSelection: !variantResult.explicit,
    _parameterConfidence: {
      subject: subject ? 0.8 : 0.3,
      variant: variantResult.explicit ? 0.9 : 0.3,
      title: title ? 0.9 : 0,
      action: action ? 0.8 : 0
    },
    _parameterSources: {
      subject: 'regex',
      variant: variantResult.explicit ? 'explicit' : 'default',
      title: title ? 'explicit' : 'not_found',
      action: action ? 'regex' : 'not_found'
    }
  };
}

/**
 * Detect imagine mode based on message and context
 * @returns {'pure' | 'sharepic' | 'edit'}
 */
function detectImagineMode(normalizedMessage, context) {
  // EDIT mode: image attached + transformation intent
  if (context.hasImageAttachment) {
    const editKeywords = ['transformiere', 'bearbeite', 'ändere', 'begrüne', 'verwandle', 'mache grün', 'grüner machen', 'umwandeln'];
    if (editKeywords.some(k => normalizedMessage.includes(k))) {
      return 'edit';
    }
  }

  // SHAREPIC mode: explicit title mention
  const sharepicKeywords = ['mit titel', 'mit dem titel', 'mit text', 'ki-sharepic', 'mit überschrift', 'mit der überschrift', 'titel:', 'überschrift:'];
  if (sharepicKeywords.some(k => normalizedMessage.includes(k))) {
    return 'sharepic';
  }

  // Default to PURE mode
  return 'pure';
}

/**
 * Extract the subject/description for the image
 */
function extractImagineSubject(message, mode) {
  // Remove command words to get the actual subject
  let subject = message;

  // Remove common command prefixes (including variant words in the pattern)
  // Note: Don't strip "mit" when followed by "titel" (sharepic mode)
  const commandPatterns = [
    /^(?:erstelle|generiere|mache|erzeuge)\s+(?:mir\s+)?(?:ein(?:en?)?(?:e)?)\s+(?:realistisch(?:es?|er?)?|illustration|illustriert(?:es?|er?)?|pixel(?:\s*art)?|editorial|fotorealistisch(?:es?|er?)?|gemalt(?:es?|er?)?|gezeichnet(?:es?|er?)?)?\s*(?:bild|foto|illustration|grafik)\s+(?:von|über|zu|im\s+stil)?\s*/i,
    /^(?:erstelle|generiere|mache|erzeuge)\s+(?:mir\s+)?(?:ein(?:en?)?(?:e)?)\s+(?:realistisch(?:es?|er?)?|illustration|illustriert(?:es?|er?)?|pixel(?:\s*art)?|editorial|fotorealistisch(?:es?|er?)?|gemalt(?:es?|er?)?|gezeichnet(?:es?|er?)?)?\s*(?:bild|foto|illustration|grafik)\s+/i,
    /^(?:bild|foto|illustration|grafik)\s+(?:von|über|zu)?\s*/i,
    /^(?:visualisiere|illustriere)\s+(?:mir\s+)?(?:ein(?:en?)?(?:e)?)?\s*/i,
    /^(?:imagine|flux)\s*/i
  ];

  for (const pattern of commandPatterns) {
    subject = subject.replace(pattern, '');
  }

  // Remove title specification for sharepic mode
  if (mode === 'sharepic') {
    // Match "mit dem Titel X über/von/zu Y" - keep Y as subject
    const titleSubjectMatch = subject.match(/mit\s+(?:dem\s+)?titel\s+\S+\s+(?:über|von|zu)\s+(.+)/i);
    if (titleSubjectMatch) {
      subject = titleSubjectMatch[1];
    } else {
      subject = subject.replace(/mit\s+(?:dem\s+)?titel\s+\S+\s*/i, '');
      subject = subject.replace(/titel:\s*["']?[^"'\n]+["']?\s*/i, '');
    }
  }

  // Remove variant specifications
  const variantPatterns = Object.keys(IMAGINE_VARIANT_KEYWORDS);
  for (const variant of variantPatterns) {
    subject = subject.replace(new RegExp(`\\b${variant}(?:es?|er?)?\\b`, 'gi'), '');
  }

  // Clean up
  subject = subject.replace(/\s+/g, ' ').trim();

  return subject.length > 0 ? subject : null;
}

/**
 * Extract variant/style preference
 */
function extractImagineVariant(normalizedMessage) {
  for (const [keyword, variant] of Object.entries(IMAGINE_VARIANT_KEYWORDS)) {
    if (normalizedMessage.includes(keyword)) {
      return { variant, explicit: true };
    }
  }

  // Default variant (will trigger variant selection question)
  return { variant: null, explicit: false };
}

/**
 * Extract title for sharepic mode
 */
function extractImagineTitle(message) {
  const titlePatterns = [
    /mit\s+(?:dem\s+)?titel\s*["']([^"']+)["']/i,
    /mit\s+(?:der?\s+)?überschrift\s*["']([^"']+)["']/i,
    /titel:\s*["']?([^"'\n]+?)["']?(?:\s|$)/i,
    /überschrift:\s*["']?([^"'\n]+?)["']?(?:\s|$)/i,
    /mit\s+(?:dem\s+)?titel\s+(\S+)/i,
    /mit\s+(?:der?\s+)?überschrift\s+(\S+)/i
  ];

  for (const pattern of titlePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract action/instruction for edit mode
 */
function extractEditAction(message) {
  // For edit mode, the action describes what transformation to apply
  const actionPatterns = [
    /(?:transformiere|verwandle|ändere|bearbeite)\s+(?:das\s+bild\s+)?(?:zu|in|so\s+dass)\s+(.+)/i,
    /(?:begrüne|mache\s+grün(?:er)?)\s+(.+)/i,
    /(.+?)\s+(?:transformieren|verwandeln|bearbeiten)/i
  ];

  for (const pattern of actionPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Return the whole message as action if no pattern matches
  return message;
}

/**
 * Helper functions for parameter extraction
 */

function extractTheme(message, context) {
  // Check context first
  if (context.topic) {
    return context.topic;
  }

  // Common theme patterns
  const themePatterns = [
    /(?:zum thema|über|bezüglich|betreffend)\s+([^.!?]+)/i,
    /(?:thema:?\s*)([^.!?]+)/i,
    /(klimaschutz|umwelt|verkehr|energie|bildung|soziales|wirtschaft|digitalisierung|europa|demokratie)/i
  ];

  for (const pattern of themePatterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // Extract potential theme from first part of message
  const words = message.split(' ');
  if (words.length > 3) {
    return words.slice(0, Math.min(5, words.length)).join(' ');
  }

  return null;
}

function extractDetails(message, theme) {
  if (!theme) return message;

  // Remove the theme part and return the rest as details
  const themeIndex = message.toLowerCase().indexOf(theme.toLowerCase());
  if (themeIndex !== -1) {
    const beforeTheme = message.substring(0, themeIndex).trim();
    const afterTheme = message.substring(themeIndex + theme.length).trim();

    // Return the longer part as details
    const details = afterTheme.length > beforeTheme.length ? afterTheme : beforeTheme;
    return details.replace(/^[,.:;]\s*/, ''); // Clean up punctuation
  }

  return message;
}

function extractPlatforms(message) {
  const platforms = [];
  const platformKeywords = {
    'facebook': ['facebook', 'fb'],
    'instagram': ['instagram', 'insta'],
    'twitter': ['twitter', 'x.com'],
    'linkedin': ['linkedin'],
    'tiktok': ['tiktok'],
    'pressemitteilung': ['presse', 'pressemitteilung', 'medien']
  };

  const lowerMessage = message.toLowerCase();

  for (const [platform, keywords] of Object.entries(platformKeywords)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      platforms.push(platform);
    }
  }

  return platforms;
}

function extractQuoteAuthor(message) {
  const authorPatterns = [
    // More specific pattern that stops at common word boundaries
    { pattern: /(?:von|author|autor|name:?\s*)([a-züäöß\s-]+?)(?:\s+(?:und|soll|zu|über|für|mit|bei|an|auf|in|das|die|der|ist|war|hat|wird)|[.!?]|$)/i, confidence: 0.9 },
    { pattern: /([a-züäöß\s-]+)\s+(?:sagt|meint|erklärt)/i, confidence: 0.8 },
    { pattern: /"([^"]+)"\s*-\s*([a-züäöß\s-]+)/i, confidence: 0.95, group: 2 }
  ];

  for (const { pattern, confidence, group = 1 } of authorPatterns) {
    const match = message.match(pattern);
    if (match && match[group]) {
      const name = match[group].trim();
      // Validate name (must be reasonable length and contain letters)
      if (name.length >= 2 && name.length <= 50 && /[a-züäöß]/i.test(name)) {
        return {
          value: name,
          confidence: confidence,
          source: 'explicit'
        };
      }
    }
  }

  return {
    value: null,
    confidence: 0,
    source: 'not_found'
  };
}

function extractLines(message) {
  // Look for patterns like "Zeile 1: ... Zeile 2: ... Zeile 3: ..."
  const linePattern = /zeile\s*(\d+):?\s*([^zeile]+)/gi;
  const matches = Array.from(message.matchAll(linePattern));

  if (matches.length >= 3) {
    const lines = {};
    matches.forEach(match => {
      const lineNum = parseInt(match[1]);
      const content = match[2].trim();
      if (lineNum >= 1 && lineNum <= 3) {
        lines[`line${lineNum}`] = content;
      }
    });

    if (lines.line1 && lines.line2 && lines.line3) {
      return lines;
    }
  }

  return null;
}

function extractTextForm(message) {
  const textForms = [
    'pressemitteilung', 'antrag', 'rede', 'brief', 'artikel', 'blog', 'newsletter',
    'flyer', 'broschüre', 'wahlprogramm', 'stellungnahme', 'kommentar'
  ];

  const lowerMessage = message.toLowerCase();

  for (const form of textForms) {
    if (lowerMessage.includes(form)) {
      return form.charAt(0).toUpperCase() + form.slice(1);
    }
  }

  return null;
}

function extractStyle(message) {
  const styles = {
    'sachlich': ['sachlich', 'neutral', 'objektiv'],
    'emotional': ['emotional', 'leidenschaftlich', 'bewegend'],
    'jugendlich': ['jugendlich', 'jung', 'hip', 'cool'],
    'formal': ['formal', 'offiziell', 'amtlich'],
    'persönlich': ['persönlich', 'individuell', 'direkt']
  };

  const lowerMessage = message.toLowerCase();

  for (const [style, keywords] of Object.entries(styles)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return style.charAt(0).toUpperCase() + style.slice(1);
    }
  }

  return null;
}

function extractStructure(message) {
  const structurePatterns = [
    /(?:gliederung|struktur|aufbau):?\s*([^.!?]+)/i,
    /(?:mit|in)\s+(\d+)\s+(?:punkten|teilen|abschnitten)/i
  ];

  for (const pattern of structurePatterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

function determineRequestType(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('kleine anfrage')) return 'kleine_anfrage';
  if (lowerMessage.includes('große anfrage') || lowerMessage.includes('grosse anfrage')) return 'grosse_anfrage';

  return 'default';
}

/**
 * Check if extracted parameters meet confidence thresholds for required fields
 * @param {object} params - Extracted parameters with confidence metadata
 * @param {string} agent - Agent type
 * @returns {object} Analysis of parameter confidence
 */
function analyzeParameterConfidence(params, agent) {
  const analysis = {
    allRequiredPresent: true,
    lowConfidenceFields: [],
    missingFields: []
  };

  // Define minimum confidence thresholds for different fields
  const confidenceThresholds = {
    name: 0.7,
    thema: 0.5,
    details: 0.3
  };

  // Define required fields per agent
  const requiredFields = {
    'zitat': ['name'],
    'zitat_pure': ['name']
  };

  const requiredForAgent = requiredFields[agent] || [];

  for (const field of requiredForAgent) {
    const value = params[field];
    const confidence = params._parameterConfidence?.[field] || 0;
    const threshold = confidenceThresholds[field] || 0.5;

    // Check if field is missing or has low confidence
    if (!value || value === 'Unbekannt' || value === '') {
      analysis.missingFields.push(field);
      analysis.allRequiredPresent = false;
    } else if (confidence < threshold) {
      analysis.lowConfidenceFields.push({
        field,
        value,
        confidence,
        threshold
      });
    }
  }

  return analysis;
}

export { extractParameters, analyzeParameterConfidence, extractQuoteAuthor };