/**
 * Campaign Response Parser
 *
 * Generic response parsing module for campaign sharepics.
 * Supports declarative parsing configuration via JSON.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Line extractor configuration
 */
export interface LineExtractorConfig {
  expectedLines?: number;
  outputFields?: string[];
  trimLines?: boolean;
  filterEmpty?: boolean;
  minCharsPerLine?: number;
  maxCharsPerLine?: number;
}

/**
 * Multi-line extractor configuration
 */
export interface MultiLineExtractorConfig {
  expectedPoems?: number;
  linesPerPoem?: number;
  separator?: string;
  outputFields?: string[];
  trimLines?: boolean;
  filterEmpty?: boolean;
  minCharsPerLine?: number;
  maxCharsPerLine?: number;
}

/**
 * JSON extractor configuration
 */
export interface JsonExtractorConfig {
  fieldMapping?: Record<string, string>;
  strict?: boolean;
}

/**
 * Regex pattern configuration
 */
export interface RegexPattern {
  field: string;
  pattern: string;
  flags?: string;
  defaultValue?: string;
}

/**
 * Regex extractor configuration
 */
export interface RegexExtractorConfig {
  patterns?: RegexPattern[];
  multiline?: boolean;
}

/**
 * Parser configuration types
 */
export type ParserConfig =
  | { type: 'lineExtractor'; config: LineExtractorConfig }
  | { type: 'multiLineExtractor'; config: MultiLineExtractorConfig }
  | { type: 'jsonExtractor'; config: JsonExtractorConfig }
  | { type: 'regexExtractor'; config: RegexExtractorConfig };

/**
 * Parsed response result
 */
export type ParsedResponse = Record<string, string>;

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Line Extractor Parser
 * Extracts lines from text response and maps to output fields
 *
 * @param rawResponse - Raw text response from AI
 * @param config - Parser configuration
 * @returns Parsed data with output fields
 */
export const lineExtractor = (rawResponse: string, config: LineExtractorConfig): ParsedResponse => {
  const {
    expectedLines = 5,
    outputFields = ['line1', 'line2', 'line3', 'line4', 'line5'],
    trimLines = true,
    filterEmpty = true,
    minCharsPerLine = 0,
    maxCharsPerLine = Infinity,
  } = config;

  // Split response into lines
  let lines = rawResponse.split('\n');

  // Apply trimming if enabled
  if (trimLines) {
    lines = lines.map((line) => line.trim());
  }

  // Filter empty lines if enabled
  if (filterEmpty) {
    lines = lines.filter((line) => line.length > 0);
  }

  // Take only the expected number of lines
  lines = lines.slice(0, expectedLines);

  // Pad with empty strings if we have fewer lines than expected
  while (lines.length < expectedLines) {
    lines.push('');
  }

  // Validate line lengths if constraints are specified
  if (minCharsPerLine > 0 || maxCharsPerLine < Infinity) {
    const validLines = lines.filter(
      (line) => line.length >= minCharsPerLine && line.length <= maxCharsPerLine
    );

    // Log warning if some lines were filtered out
    if (validLines.length < lines.length) {
      console.warn(
        `[lineExtractor] Filtered ${lines.length - validLines.length} lines due to length constraints`
      );
    }
  }

  // Map lines to output fields
  const result: ParsedResponse = {};
  outputFields.forEach((fieldName, index) => {
    result[fieldName] = lines[index] || '';
  });

  return result;
};

/**
 * Multi-Line Extractor Parser
 * Extracts multiple poems from a single AI response separated by a delimiter
 *
 * @param rawResponse - Raw text response from AI containing multiple poems
 * @param config - Parser configuration
 * @returns Array of parsed poem objects
 */
export const multiLineExtractor = (
  rawResponse: string,
  config: MultiLineExtractorConfig
): ParsedResponse[] => {
  const {
    expectedPoems = 4,
    linesPerPoem = 5,
    separator = '---',
    outputFields = ['line1', 'line2', 'line3', 'line4', 'line5'],
    trimLines = true,
    filterEmpty = true,
    minCharsPerLine = 0,
    maxCharsPerLine = Infinity,
  } = config;

  const poemSections = rawResponse.split(separator);
  const poems: ParsedResponse[] = [];

  for (let i = 0; i < Math.min(poemSections.length, expectedPoems); i++) {
    let lines = poemSections[i].split('\n');

    if (trimLines) {
      lines = lines.map((line) => line.trim());
    }

    if (filterEmpty) {
      lines = lines.filter((line) => line.length > 0);
    }

    lines = lines.slice(0, linesPerPoem);

    while (lines.length < linesPerPoem) {
      lines.push('');
    }

    const poem: ParsedResponse = {};
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
 * @param rawResponse - Raw JSON response from AI
 * @param config - Parser configuration
 * @returns Parsed data with output fields
 */
export const jsonExtractor = (rawResponse: string, config: JsonExtractorConfig): ParsedResponse => {
  const { fieldMapping = {}, strict = false } = config;

  let parsedJson: any;

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
        throw new Error(`Failed to parse JSON response: ${(innerError as Error).message}`);
      }
    } else {
      throw new Error('No valid JSON found in response');
    }
  }

  // Extract fields according to mapping
  const result: ParsedResponse = {};
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
 * @param rawResponse - Raw text response from AI
 * @param config - Parser configuration
 * @returns Parsed data with output fields
 */
export const regexExtractor = (
  rawResponse: string,
  config: RegexExtractorConfig
): ParsedResponse => {
  const { patterns = [], multiline = true } = config;

  const result: ParsedResponse = {};

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
 * @param rawResponse - Raw response from AI
 * @param parserConfig - Parser configuration
 * @returns Parsed data
 */
export const parseResponse = (
  rawResponse: string,
  parserConfig: ParserConfig
): ParsedResponse | ParsedResponse[] => {
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
      throw new Error(`Unknown parser type: ${(parserConfig as any).type}`);
  }
};
