const express = require('express');
const router = express.Router();
const prompts = require('../../../prompts/sharepic');
// const aiShortenerService = require('../../../services/aiShortenerService');

// Helper function to detect if an error is related to throttling/temporary issues
const isThrottlingError = (error) => {
  if (!error || typeof error !== 'string') return false;
  const errorLower = error.toLowerCase();
  return errorLower.includes('throttl') ||
         errorLower.includes('rate limit') ||
         errorLower.includes('capacity') ||
         errorLower.includes('too many requests') ||
         errorLower.includes('service unavailable');
};

// Template helper function to replace placeholders
// Helper function to extract clean JSON from malformed responses
const extractCleanJSON = (content) => {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // Remove markdown backticks and "json" language markers
  const cleanedContent = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  // Try to find the last valid JSON object (greedy match to get complete object)
  const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    } catch (parseError) {
      console.warn('[extractCleanJSON] Parse error:', parseError.message);
      // Try non-greedy fallback for nested objects
      const fallbackMatch = cleanedContent.match(/\{[^{}]*\}/);
      if (fallbackMatch) {
        try {
          return JSON.parse(fallbackMatch[0]);
        } catch (fallbackError) {
          console.warn('[extractCleanJSON] Fallback parse error:', fallbackError.message);
        }
      }
    }
  }

  return null;
};

// Helper function to extract clean JSON array from malformed responses
const extractCleanJSONArray = (content) => {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // Remove markdown backticks and "json" language markers
  const cleanedContent = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  // Try to find valid JSON array (greedy match to get complete array)
  const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (parseError) {
      console.warn('[extractCleanJSONArray] Parse error:', parseError.message);
    }
  }

  return null;
};

const replaceTemplate = (template, data) => {
  if (!template || typeof template !== 'string') {
    return template;
  }

  let result = template;

  // Handle {{#if preserveName}}...{{else}}...{{/if}} conditional
  if (result.includes('{{#if preserveName}}')) {
    const preserveNameRegex = /\{\{#if preserveName\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/;
    const match = result.match(preserveNameRegex);
    if (match) {
      const preserveBranch = match[1];
      const nonPreserveBranch = match[2];
      result = result.replace(match[0], data.preserveName ? preserveBranch : nonPreserveBranch);
    }
  }

  // Handle {{#if (and thema details)}}...{{else}}...{{/if}} conditional
  if (result.includes('{{#if (and thema details)}}')) {
    const themaDetailsRegex = /\{\{#if \(and thema details\)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/;
    const match = result.match(themaDetailsRegex);
    if (match) {
      const themaBranch = match[1];
      const quoteBranch = match[2];
      result = result.replace(match[0], (data.thema && data.details) ? themaBranch : quoteBranch);
    }
  }

  // Replace simple placeholders
  result = result.replace(/\{\{([^#/}][^}]*)\}\}/g, (match, key) => {
    const cleanKey = key.trim();

    // Handle default values
    if (cleanKey.includes('|default:')) {
      const [actualKey, defaultValue] = cleanKey.split('|default:');
      const value = data[actualKey.trim()];
      return value !== undefined && value !== null && value !== ''
        ? value
        : defaultValue.replace(/'/g, '');
    }

    return data[cleanKey] !== undefined ? data[cleanKey] : '';
  });

  return result;
};

const sanitizeInfoField = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\*\*/g, '') // Remove markdown bold
    .replace(/#\w+/g, '') // Remove hashtags
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();
};

// Normalize slightly messy model responses into valid JSON arrays
const extractQuoteArray = (content) => {
  if (typeof content !== 'string') {
    return null;
  }

  const withoutCodeFences = content
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '');

  const match = withoutCodeFences.match(/\[[\s\S]*\]/);
  if (!match) {
    return null;
  }

  let candidate = match[0]
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*(?=[}\]])/g, '');

  try {
    const parsed = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.warn('[sharepic] Failed to parse sanitized JSON response', error);
    return null;
  }
};

// Helper function to clean line by removing prefixes like "Zeile 1:", "Line 1:", etc.
const cleanLine = (line) => {
  // Match patterns like "Zeile 1:", "Line 1:", "Línea 1:", or just numbered prefixes
  return line.replace(/^(Zeile|Line|Línea)?\s*\d+\s*:\s*/i, '').trim();
};

// Helper function to parse dreizeilen response
const parseDreizeilenResponse = (content, skipShortener = false) => {
  console.log(`[parser] Received content starting with: "${content.substring(0, 30)}"`);

  const allLines = content.split('\n');

  // Find first group of 3 consecutive non-empty lines
  for (let i = 0; i <= allLines.length - 3; i++) {
    const line1 = allLines[i].trim();
    const line2 = allLines[i + 1].trim();
    const line3 = allLines[i + 2].trim();

    // Check if all 3 lines exist and are valid
    if (line1 && line2 && line3) {
      console.log(`[parser] Checking lines: ["${line1}", "${line2}", "${line3}"]`);

      if (line1.toLowerCase().includes('suchbegriff') || line2.toLowerCase().includes('suchbegriff') || line3.toLowerCase().includes('suchbegriff')) {
        console.log(`[parser] Rejected: contains 'suchbegriff'`);
        continue;
      }

      if (line1.length < 3 || line1.length > 35 || line2.length < 3 || line2.length > 35 || line3.length < 3 || line3.length > 35) {
        console.log(`[parser] Rejected: length issue [${line1.length}, ${line2.length}, ${line3.length}]`);
        continue;
      }

      console.log(`[parser] SUCCESS - returning valid slogan`);
      return { line1, line2, line3 };
    }
  }

  console.log(`[parser] FAILED - no valid lines found in ${allLines.length} total lines`);
  return { line1: '', line2: '', line3: '' };
};

// Helper function to check if slogan is valid
const isSloganValid = (slogan) => {
  return slogan.line1 && slogan.line2 && slogan.line3;
};

// Helper function to check if info post is valid (character limits)
const isInfoValid = (info) => {
  if (!info.header || !info.subheader || !info.body) {
    return false;
  }

  const headerLength = info.header.length;
  const subheaderLength = info.subheader.length;
  const bodyLength = info.body.length;

  // Slightly relaxed ranges for better success rate: ±5 characters tolerance
  return headerLength >= 45 && headerLength <= 65 &&
         subheaderLength >= 75 && subheaderLength <= 125 &&
         bodyLength >= 145 && bodyLength <= 255;
};

// Handler for dreizeilen type
const handleDreizeilenRequest = async (req, res) => {

  const { thema, details, line1, line2, line3, count = 1, source } = req.body;
  const singleItem = count === 1;
  const skipShortener = source === 'sharepicgenerator';

  // Use campaign prompt if provided, otherwise use standard
  const config = req.body._campaignPrompt || prompts.dreizeilen;
  const systemRole = config.systemRole;

  const getRequestTemplate = () => {
    const template = singleItem ? config.singleItemTemplate : config.requestTemplate;
    const templateData = { thema, details, line1, line2, line3 };

    return replaceTemplate(template, templateData);
  };

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let mainSlogan = { line1: '', line2: '', line3: '' };
    let searchTerms = [];
    let allGeneratedContent = []; // Store content from all attempts for debugging
    let result; // Declare result outside the loop so it's accessible later

    // Retry loop for AI generation
    while (attempts < maxAttempts) {
      const requestTemplate = getRequestTemplate();

      const requestOptions = config.options;

      result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_dreizeilen',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: requestTemplate }],
        options: requestOptions
      }, req);


      if (!result.success) {
        // Check if this is a throttling error - if so, don't count it as an attempt
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        console.error(`[sharepic_dreizeilen] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          return res.status(500).json({ success: false, error: result.error });
        }
        continue;
      }

      // Success - count this as an attempt for consistency
      attempts++;

      // Parse response to extract slogans and search terms
      const content = result.content;

      // Store content for debugging
      allGeneratedContent.push({
        attempt: attempts,
        content: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
        timestamp: new Date().toISOString()
      });

      const searchTermMatch = content.match(/Suchbegriff[^:]*:(.+?)(?:\n|$)/i);
      searchTerms = searchTermMatch ? [searchTermMatch[1].trim()] : [];

      if (singleItem) {
        // Log raw AI response for debugging
        console.log(`[sharepic_dreizeilen] Raw AI response on attempt ${attempts}:`, content.substring(0, 300) + (content.length > 300 ? '...' : ''));

        // Parse single item response
        console.log(`[sharepic_dreizeilen] Calling parser with ${content.length} chars`);
        mainSlogan = parseDreizeilenResponse(content, skipShortener);

        // Log parsing result for debugging
        console.log(`[sharepic_dreizeilen] Parsed slogan on attempt ${attempts}:`, mainSlogan);

        // Check if parsing succeeded
        if (isSloganValid(mainSlogan)) {
          console.log(`[sharepic_dreizeilen] Valid slogan found on attempt ${attempts}`);
          break;
        } else {
          console.log(`[sharepic_dreizeilen] Invalid slogan on attempt ${attempts}, continuing...`);
        }
      } else {
        // Handle multiple slogans without headers
        console.log(`[sharepic_dreizeilen] Parsing multiple slogans (count=${count})`);
        const slogans = [];
        const lines = content.split('\n');

        // Find groups of 3 consecutive non-empty lines
        for (let i = 0; i <= lines.length - 3; i++) {
          const line1 = lines[i].trim();
          const line2 = lines[i + 1].trim();
          const line3 = lines[i + 2].trim();

          // Check if we found a valid 3-line group
          if (line1 && line2 && line3 &&
              !line1.toLowerCase().includes('suchbegriff') &&
              !line2.toLowerCase().includes('suchbegriff') &&
              !line3.toLowerCase().includes('suchbegriff') &&
              line1.length >= 3 && line1.length <= 35 &&
              line2.length >= 3 && line2.length <= 35 &&
              line3.length >= 3 && line3.length <= 35) {

            console.log(`[sharepic_dreizeilen] Found slogan ${slogans.length + 1}: "${line1}", "${line2}", "${line3}"`);
            slogans.push({ line1, line2, line3 });
            i += 2; // Skip the lines we just processed (i++ will add 1 more)

            // If we found 5 slogans, we can stop
            if (slogans.length >= 5) break;
          }
        }

        console.log(`[sharepic_dreizeilen] Found ${slogans.length} slogans total`);
        mainSlogan = slogans[0] || { line1: '', line2: '', line3: '' };
        if (isSloganValid(mainSlogan)) {
          const alternatives = slogans.slice(1);

          return res.json({
            success: true,
            mainSlogan: mainSlogan,
            alternatives: alternatives,
            searchTerms: searchTerms
          });
        }
      }
    }

    // After all attempts, check if we have a valid result
    if (!isSloganValid(mainSlogan)) {
      // Create a preview of the last generated content for debugging
      const lastContent = result?.content || 'No content available';
      const contentPreview = lastContent.substring(0, 200) + (lastContent.length > 200 ? '...' : '');

      if (skipShortener) {
        console.error(`[sharepic_dreizeilen] Failed to generate valid dreizeilen after ${maxAttempts} attempts`);
        console.error(`[sharepic_dreizeilen] Last generated content preview:`, contentPreview);
        console.error(`[sharepic_dreizeilen] Final mainSlogan state:`, mainSlogan);

        return res.status(500).json({
          success: false,
          error: `Failed to generate valid dreizeilen after ${maxAttempts} attempts`,
          debug: {
            contentPreview,
            finalSlogan: mainSlogan,
            attempts: maxAttempts,
            allGeneratedContent
          }
        });
      }

      // AI shortener disabled - using fallback truncation only
      // try {
      //   const shortenedSlogan = await aiShortenerService.shortenSharepicText('dreizeilen', mainSlogan, req);

      //   if (isSloganValid(shortenedSlogan)) {
      //     return res.json({
      //       success: true,
      //       mainSlogan: shortenedSlogan,
      //       alternatives: [],
      //       searchTerms: searchTerms
      //     });
      //   }
      // } catch (shortenerError) {
      //   console.error(`[sharepic_dreizeilen] AI shortener error:`, shortenerError);
      // }

      // Create a preview of the last generated content for debugging
      const finalContent = result?.content || 'No content available';
      const finalPreview = finalContent.substring(0, 200) + (finalContent.length > 200 ? '...' : '');

      console.error(`[sharepic_dreizeilen] Failed to generate valid dreizeilen after ${maxAttempts} attempts`);
      console.error(`[sharepic_dreizeilen] Last generated content preview:`, finalPreview);
      console.error(`[sharepic_dreizeilen] Final mainSlogan state:`, mainSlogan);

      return res.status(500).json({
        success: false,
        error: `Failed to generate valid dreizeilen after ${maxAttempts} attempts`,
        debug: {
          contentPreview: finalPreview,
          finalSlogan: mainSlogan,
          attempts: maxAttempts,
          // shortenerTried: true,
          allGeneratedContent
        }
      });
    }

    // Return successful single item result
    res.json({
      success: true,
      mainSlogan: mainSlogan,
      alternatives: [],
      searchTerms: searchTerms
    });

  } catch (error) {
    console.error('[sharepic_dreizeilen] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Handler for zitat type
const handleZitatRequest = async (req, res) => {

  const { thema, details, quote, name, count = 1, source } = req.body;
  const singleItem = count === 1;
  const skipShortener = source === 'sharepicgenerator';

  // Use campaign prompt if provided, otherwise use standard
  const config = req.body._campaignPrompt || prompts.zitat;
  const systemRole = config.systemRole;

  const requestTemplate = replaceTemplate(
    singleItem ? config.singleItemTemplate : config.requestTemplate,
    { thema, details, quote, name }
  );

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let result;

    // Retry loop for AI generation
    while (attempts < maxAttempts) {
      result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_zitat',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: requestTemplate }],
        options: config.options
      }, req);

      if (!result.success) {
        // Check if this is a throttling error - if so, don't count it as an attempt
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        console.error(`[sharepic_zitat] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          return res.status(500).json({ success: false, error: result.error });
        }
        continue;
      }

      // Success - break out of retry loop
      break;
    }

    // Parse the AI response to extract quotes
    let quotes = [];
    let firstQuote = '';
    let alternatives = [];

    if (singleItem) {
      // For single item, try to parse JSON object first
      try {
        const jsonMatch = result.content.match(/\{[^}]*"quote"\s*:\s*"[^"]+"\s*[^}]*\}/);
        if (jsonMatch) {
          const quoteData = JSON.parse(jsonMatch[0]);
          firstQuote = quoteData.quote || '';
        } else {
          // Fallback: extract quote from content
          firstQuote = (result.content || '').trim();
        }
        alternatives = []; // No alternatives for single item

        // AI shortener disabled - no truncation

      } catch (parseError) {
        console.warn('[sharepic_zitat] Single item JSON parsing failed, using fallback:', parseError.message);
        firstQuote = (result.content || '').trim();
        alternatives = [];

        // AI shortener disabled - no truncation
      }
    } else {
      // Multiple items (original behavior)
      quotes = extractQuoteArray(result.content);
      if (!quotes || quotes.length === 0) {
        quotes = [{ quote: (result.content || '').trim() }];
      } else {
        quotes = quotes.map((item) =>
          typeof item === 'string' ? { quote: item } : item
        );
      }

      // AI shortener disabled - no truncation

      firstQuote = quotes[0]?.quote || (result.content || '').trim();
      alternatives = quotes.slice(1);
    }

    res.json({
      success: true,
      quote: firstQuote,
      alternatives: alternatives,
      name: name || ''
    });
  } catch (error) {
    console.error('[sharepic_zitat] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Handler for zitat_pure type
const handleZitatPureRequest = async (req, res) => {

  const { thema, details, quote, name, count = 5, preserveName = false, source } = req.body;
  const singleItem = count === 1;
  const skipShortener = source === 'sharepicgenerator';

  // Use campaign prompt if provided, otherwise use standard
  const config = req.body._campaignPrompt || prompts.zitat_pure;
  const systemRole = config.systemRole;

  const requestTemplate = replaceTemplate(
    singleItem ? config.singleItemTemplate : config.requestTemplate,
    { thema, details, quote, name, preserveName }
  );

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let result;

    // Retry loop for AI generation
    while (attempts < maxAttempts) {
      result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_zitat_pure',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: requestTemplate }],
        options: config.options
      }, req);

      if (!result.success) {
        // Check if this is a throttling error - if so, don't count it as an attempt
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        console.error(`[sharepic_zitat_pure] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          return res.status(500).json({ success: false, error: result.error });
        }
        continue;
      }

      // Success - break out of retry loop
      break;
    }

    // Parse the AI response based on format
    let quotes = [];
    let quoteName = name || '';

    if (singleItem) {
      // Parse response based on preserveName flag
      if (preserveName && name) {
        // Chat feature: AI returns just the quote text, use provided name
        quotes = [{ quote: (result.content || '').trim() }];
        quoteName = name; // Use the preserved name
      } else {
        // Backward compatibility: Parse JSON format for single item
        const zitatData = extractCleanJSON(result.content);
        if (zitatData && zitatData.quote) {
          quotes = [{ quote: zitatData.quote }];
          quoteName = zitatData.name || quoteName;
        } else {
          quotes = [{ quote: (result.content || '').trim() }];
        }
      }
    } else {
      // Parse original format for multiple items
      quotes = extractQuoteArray(result.content);
      if (!quotes || quotes.length === 0) {
        quotes = [{ quote: (result.content || '').trim() }];
      } else {
        quotes = quotes.map((item) =>
          typeof item === 'string' ? { quote: item } : item
        );
      }
    }

    // Format response for frontend
    let firstQuote = quotes[0]?.quote || (result.content || '').trim();
    let alternatives = quotes.slice(1);

    // AI shortener disabled - no truncation

    res.json({
      success: true,
      quote: firstQuote,
      alternatives: alternatives,
      name: quoteName
    });
  } catch (error) {
    console.error('[sharepic_zitat_pure] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Handler for headline type
const handleHeadlineRequest = async (req, res) => {

  const { thema, details, line1, line2, line3, count = 1, source } = req.body;
  const singleItem = count === 1;
  const skipShortener = source === 'sharepicgenerator';

  // Use campaign prompt if provided, otherwise use standard
  const config = req.body._campaignPrompt || prompts.headline;
  const systemRole = config.systemRole;

  const requestTemplate = replaceTemplate(
    singleItem ? config.singleItemTemplate : config.requestTemplate,
    { thema, details, line1, line2, line3 }
  );

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let result;

    // Retry loop for AI generation
    while (attempts < maxAttempts) {
      result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_headline',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: requestTemplate }],
        options: config.options
      }, req);

      if (!result.success) {
        // Check if this is a throttling error - if so, don't count it as an attempt
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        console.error(`[sharepic_headline] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          return res.status(500).json({ success: false, error: result.error });
        }
        continue;
      }

      // Success - break out of retry loop
      break;
    }

    // Parse response to extract headlines and search terms
    const content = result.content;
    const headlines = [];
    const searchTermMatch = content.match(/Suchbegriff[^:]*:(.+?)(?:\n|$)/i);
    const searchTerms = searchTermMatch ? [searchTermMatch[1].trim()] : [];

    if (singleItem) {
      // For single item, try to extract lines directly from content without Headline headers
      const lines = content.split('\n').filter(line => line.trim() && !line.toLowerCase().includes('suchbegriff'));

      // Find three consecutive lines that look like headlines (short lines)
      let mainSlogan = { line1: '', line2: '', line3: '' };

      for (let i = 0; i < lines.length - 2; i++) {
        // Clean lines by removing prefixes before validation
        const line1 = cleanLine(lines[i]);
        const line2 = cleanLine(lines[i + 1]);
        const line3 = cleanLine(lines[i + 2]);

        // Check if these lines look like headline lines (short and not descriptive text)
        if (line1.length >= 6 && line1.length <= 15 &&
            line2.length >= 6 && line2.length <= 15 &&
            line3.length >= 6 && line3.length <= 15 &&
            !line1.toLowerCase().includes('headline') &&
            !line1.toLowerCase().includes('zeile') &&
            !line1.startsWith('**') &&
            !line1.includes('suchbegriff')) {
          mainSlogan = { line1, line2, line3 };
          break;
        }
      }

      // AI shortener disabled - no truncation

      res.json({
        success: true,
        mainSlogan: mainSlogan,
        alternatives: [], // No alternatives for single item
        searchTerms: searchTerms
      });
    } else {
      // Extract multiple headlines (original behavior)
      const headlineMatches = content.matchAll(/\*\*Headline \d+:\*\*\s*\n([^\n]+)\n([^\n]+)\n([^\n]+)/g);
      for (const match of headlineMatches) {
        headlines.push({
          line1: match[1].trim(),
          line2: match[2].trim(),
          line3: match[3].trim()
        });
      }

      // AI shortener disabled - no truncation

      // Format for frontend
      const mainSlogan = headlines[0] || { line1: '', line2: '', line3: '' };
      const alternatives = headlines.slice(1);

      res.json({
        success: true,
        mainSlogan: mainSlogan,
        alternatives: alternatives,
        searchTerms: searchTerms
      });
    }
  } catch (error) {
    console.error('[sharepic_headline] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Handler for info type
const handleInfoRequest = async (req, res) => {
  console.log('[sharepic_info] handleInfoRequest called with body:', req.body);

  const { thema, details, count = 5, source } = req.body;
  const singleItem = count === 1;
  const skipShortener = source === 'sharepicgenerator';

  console.log('[sharepic_info] Config:', { singleItem, skipShortener, count, source });

  // Use campaign prompt if provided, otherwise use standard
  const config = req.body._campaignPrompt || prompts.info;
  const systemRole = config.systemRole;

  const getInfoRequestTemplate = () => {
    const template = singleItem ? config.singleItemTemplate : config.requestTemplate;
    return replaceTemplate(template, { thema, details });
  };

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let responseData = null;

    // Retry loop for AI generation
    while (attempts < maxAttempts && !responseData) {
      const currentRequestTemplate = getInfoRequestTemplate();

      const result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_info',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: currentRequestTemplate }],
        options: config.options
      }, req);

      if (!result.success) {
        // Check if this is a throttling error - if so, don't count it as an attempt
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        console.error(`[sharepic_info] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          return res.status(500).json({ success: false, error: result.error });
        }
        continue;
      }

      // Success - count this as an attempt for consistency
      attempts++;

      // Adaptive parsing based on requested format
      const content = result.content;

      if (singleItem) {
        // Parse JSON response for single item
        const infoData = extractCleanJSON(content);
        console.log(`[sharepic_info] Attempt ${attempts} - Raw content preview:`, content.substring(0, 200));
        console.log(`[sharepic_info] Attempt ${attempts} - Parsed infoData:`, infoData);

        if (infoData) {
          const header = sanitizeInfoField(infoData.header);
          const subheader = sanitizeInfoField(infoData.subheader);
          const body = sanitizeInfoField(infoData.body);
          const searchTerm = sanitizeInfoField(infoData.searchTerm);

          console.log(`[sharepic_info] Attempt ${attempts} - Sanitized values:`, {
            header: header?.substring(0, 50) + '...',
            subheader: subheader?.substring(0, 50) + '...',
            body: body?.substring(0, 50) + '...',
            headerLength: header?.length,
            subheaderLength: subheader?.length,
            bodyLength: body?.length
          });

          // Validate required fields - check for empty strings
          if (!header || !subheader || !body ||
              header.trim() === '' || subheader.trim() === '' || body.trim() === '') {
            console.log(`[sharepic_info] Attempt ${attempts} - Validation failed: empty or missing fields`);
            if (attempts === maxAttempts) {
              return res.status(500).json({
                success: false,
                error: 'Missing required fields in JSON response after all attempts'
              });
            }
            continue; // Try next attempt
          }

          // Apply additional cleanup to ensure character limits
          let cleanHeader = header;
          let cleanSubheader = subheader;
          let cleanBody = body;

          // Truncate if still over limits after sanitization
          if (cleanHeader.length > 65) {
            cleanHeader = cleanHeader.substring(0, 60).trim();
          }
          if (cleanSubheader.length > 125) {
            cleanSubheader = cleanSubheader.substring(0, 120).trim();
          }
          if (cleanBody.length > 255) {
            cleanBody = cleanBody.substring(0, 250).trim();
          }

          // Validate character lengths (skip for sharepicgenerator)
          // AI shortener disabled - validation check removed


          responseData = {
            success: true,
            mainInfo: {
              header: cleanHeader,
              subheader: cleanSubheader,
              body: cleanBody
            },
            alternatives: [], // No alternatives for single item
            searchTerms: searchTerm ? [searchTerm] : []
          };
        } else {
          // extractCleanJSON failed
          if (attempts === maxAttempts) {
            const preview = content.replace(/\s+/g, ' ').slice(0, 200);
            const previewSuffix = content.length > 200 ? '…' : '';
            return res.status(500).json({
              success: false,
              error: `JSON extraction failed after ${maxAttempts} attempts. Snippet: ${preview}${previewSuffix}`
            });
          }
          // Continue to next attempt
          continue;
        }
      } else {
        // Parse JSON array response for multiple items
        const infoArray = extractCleanJSONArray(content);
        console.log(`[sharepic_info] Attempt ${attempts} - Raw content preview:`, content.substring(0, 200));
        console.log(`[sharepic_info] Attempt ${attempts} - Parsed array:`, infoArray?.length || 0, 'items');

        if (!infoArray || !Array.isArray(infoArray) || infoArray.length === 0) {
          console.log(`[sharepic_info] Attempt ${attempts} - Array extraction failed or empty`);
          if (attempts === maxAttempts) {
            return res.status(500).json({
              success: false,
              error: `Failed to extract info array after ${maxAttempts} attempts`
            });
          }
          continue;
        }

        // Validate and sanitize each item
        const validInfos = [];
        for (const item of infoArray) {
          const header = sanitizeInfoField(item.header);
          const subheader = sanitizeInfoField(item.subheader);
          const body = sanitizeInfoField(item.body);

          console.log(`[sharepic_info] Validating item:`, {
            header: header?.substring(0, 30) + '...',
            subheader: subheader?.substring(0, 30) + '...',
            body: body?.substring(0, 30) + '...',
            headerLength: header?.length,
            subheaderLength: subheader?.length,
            bodyLength: body?.length
          });

          // Check for empty strings
          if (header && subheader && body &&
              header.trim() !== '' && subheader.trim() !== '' && body.trim() !== '') {
            validInfos.push({
              header: header.length > 65 ? header.substring(0, 65).trim() : header,
              subheader: subheader.length > 125 ? subheader.substring(0, 125).trim() : subheader,
              body: body.length > 255 ? body.substring(0, 255).trim() : body
            });
          } else {
            console.log(`[sharepic_info] Item rejected: empty field(s)`);
          }
        }

        if (validInfos.length === 0) {
          console.log(`[sharepic_info] Attempt ${attempts} - No valid items after validation`);
          if (attempts === maxAttempts) {
            return res.status(500).json({
              success: false,
              error: `No valid info items after ${maxAttempts} attempts`
            });
          }
          continue;
        }

        // Extract search term from first item
        const searchTerms = infoArray[0]?.searchTerm ? [infoArray[0].searchTerm] : [];

        console.log(`[sharepic_info] Success: ${validInfos.length} valid items, searchTerms:`, searchTerms);

        // Format: first as main, rest as alternatives
        responseData = {
          success: true,
          mainInfo: validInfos[0],
          alternatives: validInfos.slice(1),
          searchTerms: searchTerms
        };
      }
    }

    // Return successful result if we have one
    if (responseData) {
      res.json(responseData);
    } else {
      console.error(`[sharepic_info] Failed to generate valid info after ${maxAttempts} attempts`);
      res.status(500).json({
        success: false,
        error: `Failed to generate valid info after ${maxAttempts} attempts`
      });
    }
  } catch (error) {
    console.error('[sharepic_info] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Handler for default type (generates 3 sharepics)
const handleDefaultRequest = async (req, res) => {

  try {
    const { generateDefaultSharepics } = require('../../../services/defaultSharepicService');
    const result = await generateDefaultSharepics(req, req.body);

    if (!result.success) {
      return res.status(500).json({ success: false, error: 'Failed to generate default sharepics' });
    }

    // Return the array of sharepics for frontend consumption
    res.json({
      success: true,
      sharepics: result.sharepics,
      metadata: result.metadata
    });

  } catch (error) {
    console.error('[sharepic_default] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Unified handler for backward compatibility
const handleClaudeRequest = async (req, res, type = 'dreizeilen') => {
  switch (type) {
    case 'default':
      return await handleDefaultRequest(req, res);
    case 'dreizeilen':
      return await handleDreizeilenRequest(req, res);
    case 'zitat':
      return await handleZitatRequest(req, res);
    case 'zitat_pure':
      return await handleZitatPureRequest(req, res);
    case 'headline':
      return await handleHeadlineRequest(req, res);
    case 'info':
      return await handleInfoRequest(req, res);
    default:
      return await handleDreizeilenRequest(req, res);
  }
};

// Route handlers for all types
router.post('/', async (req, res) => {
  await handleDreizeilenRequest(req, res);
});

// Export both the router and the handler for external use
module.exports = router;
module.exports.handleClaudeRequest = handleClaudeRequest;
