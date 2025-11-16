/**
 * Campaign Response Parser
 *
 * Generic response parsing module for campaign sharepics.
 * Supports declarative parsing configuration via JSON.
 */

/**
 * Line Extractor Parser
 * Extracts lines from text response and maps to output fields
 *
 * @param {string} rawResponse - Raw text response from AI
 * @param {Object} config - Parser configuration
 * @param {number} config.expectedLines - Expected number of lines
 * @param {Array<string>} config.outputFields - Field names for each line
 * @param {boolean} config.trimLines - Whether to trim whitespace
 * @param {boolean} config.filterEmpty - Whether to filter empty lines
 * @param {number} config.minCharsPerLine - Minimum characters per line (optional)
 * @param {number} config.maxCharsPerLine - Maximum characters per line (optional)
 * @returns {Object} Parsed data with output fields
 */
const lineExtractor = (rawResponse, config) => {
  const {
    expectedLines = 5,
    outputFields = ['line1', 'line2', 'line3', 'line4', 'line5'],
    trimLines = true,
    filterEmpty = true,
    minCharsPerLine = 0,
    maxCharsPerLine = Infinity
  } = config;

  // Split response into lines
  let lines = rawResponse.split('\n');

  // Apply trimming if enabled
  if (trimLines) {
    lines = lines.map(line => line.trim());
  }

  // Filter empty lines if enabled
  if (filterEmpty) {
    lines = lines.filter(line => line.length > 0);
  }

  // Take only the expected number of lines
  lines = lines.slice(0, expectedLines);

  // Pad with empty strings if we have fewer lines than expected
  while (lines.length < expectedLines) {
    lines.push('');
  }

  // Validate line lengths if constraints are specified
  if (minCharsPerLine > 0 || maxCharsPerLine < Infinity) {
    const validLines = lines.filter(line =>
      line.length >= minCharsPerLine && line.length <= maxCharsPerLine
    );

    // Log warning if some lines were filtered out
    if (validLines.length < lines.length) {
      console.warn(`[lineExtractor] Filtered ${lines.length - validLines.length} lines due to length constraints`);
    }
  }

  // Map lines to output fields
  const result = {};
  outputFields.forEach((fieldName, index) => {
    result[fieldName] = lines[index] || '';
  });

  return result;
};

/**
 * Multi-Line Extractor Parser
 * Extracts multiple poems from a single AI response separated by a delimiter
 *
 * @param {string} rawResponse - Raw text response from AI containing multiple poems
 * @param {Object} config - Parser configuration
 * @param {number} config.expectedPoems - Expected number of poems (default: 4)
 * @param {number} config.linesPerPoem - Lines per poem (default: 5)
 * @param {string} config.separator - Separator between poems (default: '---')
 * @param {Array<string>} config.outputFields - Field names for each line
 * @param {boolean} config.trimLines - Whether to trim whitespace
 * @param {boolean} config.filterEmpty - Whether to filter empty lines
 * @param {number} config.minCharsPerLine - Minimum characters per line (optional)
 * @param {number} config.maxCharsPerLine - Maximum characters per line (optional)
 * @returns {Array<Object>} Array of parsed poem objects
 */
const multiLineExtractor = (rawResponse, config) => {
  const {
    expectedPoems = 4,
    linesPerPoem = 5,
    separator = '---',
    outputFields = ['line1', 'line2', 'line3', 'line4', 'line5'],
    trimLines = true,
    filterEmpty = true,
    minCharsPerLine = 0,
    maxCharsPerLine = Infinity
  } = config;

  const poemSections = rawResponse.split(separator);
  const poems = [];

  for (let i = 0; i < Math.min(poemSections.length, expectedPoems); i++) {
    let lines = poemSections[i].split('\n');

    if (trimLines) {
      lines = lines.map(line => line.trim());
    }

    if (filterEmpty) {
      lines = lines.filter(line => line.length > 0);
    }

    lines = lines.slice(0, linesPerPoem);

    while (lines.length < linesPerPoem) {
      lines.push('');
    }

    const poem = {};
    outputFields.forEach((fieldName, index) => {
      poem[fieldName] = lines[index] || '';
    });

    poems.push(poem);
  }

  if (poems.length < expectedPoems) {
    console.warn(`[multiLineExtractor] Expected ${expectedPoems} poems but got ${poems.length}`);
  }

  return poems;
};

/**
 * JSON Extractor Parser
 * Parses JSON response and extracts specified fields
 *
 * @param {string} rawResponse - Raw JSON response from AI
 * @param {Object} config - Parser configuration
 * @param {Object} config.fieldMapping - Maps response fields to output fields
 * @param {boolean} config.strict - Whether to fail on missing fields
 * @returns {Object} Parsed data with output fields
 */
const jsonExtractor = (rawResponse, config) => {
  const {
    fieldMapping = {},
    strict = false
  } = config;

  let parsedJson;

  try {
    // Try to parse the response as JSON
    parsedJson = JSON.parse(rawResponse);
  } catch (error) {
    // If not valid JSON, try to extract JSON from text
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsedJson = JSON.parse(jsonMatch[0]);
      } catch (innerError) {
        throw new Error(`Failed to parse JSON response: ${innerError.message}`);
      }
    } else {
      throw new Error('No valid JSON found in response');
    }
  }

  // Extract fields according to mapping
  const result = {};
  for (const [outputField, sourceField] of Object.entries(fieldMapping)) {
    const value = parsedJson[sourceField];

    if (value === undefined && strict) {
      throw new Error(`Missing required field: ${sourceField}`);
    }

    result[outputField] = value || '';
  }

  return result;
};

/**
 * Regex Extractor Parser
 * Uses regex patterns to extract fields from response
 *
 * @param {string} rawResponse - Raw text response from AI
 * @param {Object} config - Parser configuration
 * @param {Array<Object>} config.patterns - Array of pattern configs
 * @param {boolean} config.multiline - Enable multiline mode
 * @returns {Object} Parsed data with output fields
 */
const regexExtractor = (rawResponse, config) => {
  const {
    patterns = [],
    multiline = true
  } = config;

  const result = {};

  patterns.forEach(({ field, pattern, flags, defaultValue = '' }) => {
    let regexFlags = flags || '';
    if (multiline && !regexFlags.includes('m')) {
      regexFlags += 'm';
    }

    const regex = new RegExp(pattern, regexFlags);
    const match = rawResponse.match(regex);

    if (match) {
      // If there's a capture group, use it; otherwise use the whole match
      result[field] = match[1] !== undefined ? match[1] : match[0];
    } else {
      result[field] = defaultValue;
      console.warn(`[regexExtractor] Pattern for field "${field}" did not match`);
    }
  });

  return result;
};

/**
 * Main parser function
 * Routes to appropriate parser based on type
 *
 * @param {string} rawResponse - Raw response from AI
 * @param {Object} parserConfig - Parser configuration
 * @param {string} parserConfig.type - Parser type (lineExtractor, jsonExtractor, regexExtractor)
 * @param {Object} parserConfig.config - Parser-specific configuration
 * @returns {Object} Parsed data
 */
const parseResponse = (rawResponse, parserConfig) => {
  if (!rawResponse) {
    throw new Error('No response to parse');
  }

  if (!parserConfig || !parserConfig.type) {
    throw new Error('Parser configuration missing or invalid');
  }

  const { type, config } = parserConfig;

  switch (type) {
    case 'lineExtractor':
      return lineExtractor(rawResponse, config);

    case 'multiLineExtractor':
      return multiLineExtractor(rawResponse, config);

    case 'jsonExtractor':
      return jsonExtractor(rawResponse, config);

    case 'regexExtractor':
      return regexExtractor(rawResponse, config);

    default:
      throw new Error(`Unknown parser type: ${type}`);
  }
};

module.exports = {
  parseResponse,
  lineExtractor,
  multiLineExtractor,
  jsonExtractor,
  regexExtractor
};
