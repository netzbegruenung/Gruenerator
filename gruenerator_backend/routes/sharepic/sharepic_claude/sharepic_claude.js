const express = require('express');
const router = express.Router();
const prompts = require('../../../prompts/sharepic');
const aiShortenerService = require('../../../services/aiShortenerService');

// Template helper function to replace placeholders
const replaceTemplate = (template, data) => {
  if (!template || typeof template !== 'string') return template;

  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const cleanKey = key.trim();

    // Handle conditional logic
    if (cleanKey.includes('#if')) {
      // Simple conditional handling for (and thema details)
      if (cleanKey.includes('and thema details')) {
        return data.thema && data.details ? '' : '{{else}}';
      }
      return '';
    }

    if (cleanKey === '#else' || cleanKey === '/if') {
      return '';
    }

    // Handle default values
    if (cleanKey.includes('|default:')) {
      const [actualKey, defaultValue] = cleanKey.split('|default:');
      const value = data[actualKey.trim()];
      return value !== undefined && value !== null && value !== ''
        ? value
        : defaultValue.replace(/'/g, '');
    }

    return data[cleanKey] || '';
  });
};

// Attempt to turn slightly malformed JSON with raw newlines inside strings
// into something `JSON.parse` can handle without silently dropping content.
const repairJsonString = (raw) => {
  if (typeof raw !== 'string') return raw;

  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];

    if (char === '"' && !escaped) {
      inString = !inString;
    }

    if (inString && (char === '\n' || char === '\r')) {
      result += char === '\r' ? '\\r' : '\\n';
      escaped = false;
      continue;
    }

    result += char;

    if (char === '\\' && !escaped) {
      escaped = true;
    } else {
      escaped = false;
    }
  }

  return result;
};

const sanitizeInfoField = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/\*\*/g, '').trim();
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

// Helper function to parse dreizeilen response
const parseDreizeilenResponse = (content) => {
  const lines = content.split('\n').filter(line => line.trim() && !line.toLowerCase().includes('suchbegriff'));

  // Find three consecutive lines that look like slogans (short lines)
  for (let i = 0; i < lines.length - 2; i++) {
    const line1 = lines[i].trim();
    const line2 = lines[i + 1].trim();
    const line3 = lines[i + 2].trim();

    // Check if these lines look like slogan lines (max 15 chars and not descriptive text)
    if (line1.length > 0 && line1.length <= 15 &&
        line2.length > 0 && line2.length <= 15 &&
        line3.length > 0 && line3.length <= 15 &&
        !line1.toLowerCase().includes('slogan') &&
        !line1.toLowerCase().includes('zeile') &&
        !line1.startsWith('**') &&
        !line1.includes('suchbegriff')) {
      return { line1, line2, line3 };
    }
  }

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

  return headerLength >= 50 && headerLength <= 60 &&
         subheaderLength >= 80 && subheaderLength <= 120 &&
         bodyLength >= 150 && bodyLength <= 250;
};

// Handler for dreizeilen type
const handleDreizeilenRequest = async (req, res) => {

  const { thema, details, line1, line2, line3, count = 1 } = req.body;
  const singleItem = count === 1;

  const config = prompts.dreizeilen;
  const systemRole = config.systemRole;

  const getRequestTemplate = () => {
    const template = singleItem ? config.singleItemTemplate : config.requestTemplate;
    return replaceTemplate(template, { thema, details, line1, line2, line3 });
  };

  try {
    let attempts = 0;
    const maxAttempts = 3;
    let mainSlogan = { line1: '', line2: '', line3: '' };
    let searchTerms = [];

    // Retry loop for AI generation
    while (attempts < maxAttempts) {
      attempts++;

      const requestTemplate = getRequestTemplate();

      const requestOptions = config.options;

      const result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_dreizeilen',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: requestTemplate }],
        options: requestOptions
      }, req);

      if (!result.success) {
        console.error(`[sharepic_dreizeilen] AI Worker error on attempt ${attempts}:`, result.error);
        if (attempts === maxAttempts) {
          return res.status(500).json({ success: false, error: result.error });
        }
        continue;
      }

      // Parse response to extract slogans and search terms
      const content = result.content;

      const searchTermMatch = content.match(/Suchbegriff[^:]*:(.+?)(?:\n|$)/i);
      searchTerms = searchTermMatch ? [searchTermMatch[1].trim()] : [];

      if (singleItem) {
        // Parse single item response
        mainSlogan = parseDreizeilenResponse(content);

        // Check if parsing succeeded
        if (isSloganValid(mainSlogan)) {
          break;
        }
      } else {
        // Handle multiple slogans (original behavior)
        const slogans = [];
        const sloganMatches = content.matchAll(/\*\*Slogan \d+:\*\*\s*\n([^\n]+)\n([^\n]+)\n([^\n]+)/g);
        for (const match of sloganMatches) {
          slogans.push({
            line1: match[1].trim(),
            line2: match[2].trim(),
            line3: match[3].trim()
          });
        }

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
      console.log(`[sharepic_dreizeilen] Main attempts failed, trying AI shortener fallback`);

      // Try AI shortener as fallback
      try {
        const shortenedSlogan = await aiShortenerService.shortenSharepicText('dreizeilen', mainSlogan, req);

        if (isSloganValid(shortenedSlogan)) {
          console.log(`[sharepic_dreizeilen] AI shortener successful:`, JSON.stringify(shortenedSlogan));
          return res.json({
            success: true,
            mainSlogan: shortenedSlogan,
            alternatives: [],
            searchTerms: searchTerms
          });
        }
      } catch (shortenerError) {
        console.error(`[sharepic_dreizeilen] AI shortener error:`, shortenerError);
      }

      console.error(`[sharepic_dreizeilen] Failed to generate valid dreizeilen after ${maxAttempts} attempts and AI shortener`);
      return res.status(500).json({
        success: false,
        error: `Failed to generate valid dreizeilen after ${maxAttempts} attempts and AI shortener`
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

  const { thema, details, quote, name, count = 1 } = req.body;
  const singleItem = count === 1;

  const config = prompts.zitat;
  const systemRole = config.systemRole;

  const requestTemplate = replaceTemplate(
    singleItem ? config.singleItemTemplate : config.requestTemplate,
    { thema, details, quote, name }
  );

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_zitat',
      systemPrompt: systemRole,
      messages: [{ role: 'user', content: requestTemplate }],
      options: config.options
    }, req);

    if (!result.success) {
      console.error('[sharepic_zitat] AI Worker error:', result.error);
      return res.status(500).json({ success: false, error: result.error });
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

        // Check if quote exceeds 140 characters and use shortener if needed
        if (firstQuote.length > 140) {
          console.log(`[sharepic_zitat] Quote too long (${firstQuote.length} chars), using shortener`);
          try {
            const shortenedResult = await aiShortenerService.shortenSharepicText('zitat', { quote: firstQuote, name }, req);
            firstQuote = shortenedResult.quote;
            console.log(`[sharepic_zitat] Quote shortened to ${firstQuote.length} chars`);
          } catch (shortenerError) {
            console.error(`[sharepic_zitat] Shortener error:`, shortenerError);
            // Fallback truncation
            firstQuote = firstQuote.substring(0, 137) + '...';
          }
        }

      } catch (parseError) {
        console.warn('[sharepic_zitat] Single item JSON parsing failed, using fallback:', parseError.message);
        firstQuote = (result.content || '').trim();
        alternatives = [];

        // Apply shortener to fallback as well if needed
        if (firstQuote.length > 140) {
          try {
            const shortenedResult = await aiShortenerService.shortenSharepicText('zitat', { quote: firstQuote, name }, req);
            firstQuote = shortenedResult.quote;
          } catch (shortenerError) {
            console.error(`[sharepic_zitat] Shortener error in fallback:`, shortenerError);
            firstQuote = firstQuote.substring(0, 137) + '...';
          }
        }
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

      // Apply shortener to all quotes if any exceed 140 chars
      for (let i = 0; i < quotes.length; i++) {
        if (quotes[i].quote && quotes[i].quote.length > 140) {
          console.log(`[sharepic_zitat] Quote ${i} too long (${quotes[i].quote.length} chars), using shortener`);
          try {
            const shortenedResult = await aiShortenerService.shortenSharepicText('zitat', { quote: quotes[i].quote, name }, req);
            quotes[i].quote = shortenedResult.quote;
          } catch (shortenerError) {
            console.error(`[sharepic_zitat] Shortener error for quote ${i}:`, shortenerError);
            quotes[i].quote = quotes[i].quote.substring(0, 137) + '...';
          }
        }
      }

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
  console.log('[sharepic_zitat_pure] Processing request directly');

  const { thema, details, quote, name, count = 5, preserveName = false } = req.body;
  const singleItem = count === 1;

  const config = prompts.zitat_pure;
  const systemRole = config.systemRole;

  const requestTemplate = replaceTemplate(
    singleItem ? config.singleItemTemplate : config.requestTemplate,
    { thema, details, quote, name, preserveName }
  );

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_zitat_pure',
      systemPrompt: systemRole,
      messages: [{ role: 'user', content: requestTemplate }],
      options: config.options
    }, req);

    if (!result.success) {
      console.error('[sharepic_zitat_pure] AI Worker error:', result.error);
      return res.status(500).json({ success: false, error: result.error });
    }

    // Parse the AI response based on format
    let quotes = [];
    let quoteName = name || '';
    console.log('[sharepic_zitat_pure] Result content:', result.content);

    if (singleItem) {
      // Parse response based on preserveName flag
      if (preserveName && name) {
        // Chat feature: AI returns just the quote text, use provided name
        quotes = [{ quote: (result.content || '').trim() }];
        quoteName = name; // Use the preserved name
        console.log('[sharepic_zitat_pure] Using preserved name mode:', { quote: quotes[0].quote, name: quoteName });
      } else {
        // Backward compatibility: Parse JSON format for single item
        try {
          const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const zitatData = JSON.parse(jsonMatch[0]);
            quotes = [{ quote: zitatData.quote || '' }];
            quoteName = zitatData.name || quoteName;
            console.log('[sharepic_zitat_pure] Successfully parsed JSON format:', zitatData);
          } else {
            throw new Error('No JSON object found in response');
          }
        } catch (parseError) {
          console.warn('[sharepic_zitat_pure] JSON parsing failed, using fallback:', parseError.message);
          console.warn('[sharepic_zitat_pure] Using original quoteName from req.body:', quoteName);
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

    // Check if quotes need shortening (100-160 characters for zitat_pure)
    if (firstQuote.length < 100 || firstQuote.length > 160) {
      console.log(`[sharepic_zitat_pure] Quote length ${firstQuote.length} out of range (100-160), using shortener`);
      try {
        const shortenedResult = await aiShortenerService.shortenSharepicText('zitat_pure', { quote: firstQuote, name: quoteName }, req);
        firstQuote = shortenedResult.quote;
        console.log(`[sharepic_zitat_pure] Quote adjusted to ${firstQuote.length} chars`);
      } catch (shortenerError) {
        console.error(`[sharepic_zitat_pure] Shortener error:`, shortenerError);
        // Fallback: adjust length manually
        if (firstQuote.length > 160) {
          firstQuote = firstQuote.substring(0, 157) + '...';
        }
        // If too short, leave as is
      }
    }

    // Check alternatives too
    for (let i = 0; i < alternatives.length; i++) {
      if (alternatives[i].quote && (alternatives[i].quote.length < 100 || alternatives[i].quote.length > 160)) {
        console.log(`[sharepic_zitat_pure] Alternative ${i} length ${alternatives[i].quote.length} out of range, using shortener`);
        try {
          const shortenedResult = await aiShortenerService.shortenSharepicText('zitat_pure', { quote: alternatives[i].quote, name: quoteName }, req);
          alternatives[i].quote = shortenedResult.quote;
        } catch (shortenerError) {
          console.error(`[sharepic_zitat_pure] Shortener error for alternative ${i}:`, shortenerError);
          if (alternatives[i].quote.length > 160) {
            alternatives[i].quote = alternatives[i].quote.substring(0, 157) + '...';
          }
        }
      }
    }

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
  console.log('[sharepic_headline] Processing request directly');

  const { thema, details, line1, line2, line3, count = 1 } = req.body;
  const singleItem = count === 1;

  const config = prompts.headline;
  const systemRole = config.systemRole;

  const requestTemplate = replaceTemplate(
    singleItem ? config.singleItemTemplate : config.requestTemplate,
    { thema, details, line1, line2, line3 }
  );

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_headline',
      systemPrompt: systemRole,
      messages: [{ role: 'user', content: requestTemplate }],
      options: config.options
    }, req);

    if (!result.success) {
      console.error('[sharepic_headline] AI Worker error:', result.error);
      return res.status(500).json({ success: false, error: result.error });
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
        const line1 = lines[i].trim();
        const line2 = lines[i + 1].trim();
        const line3 = lines[i + 2].trim();

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

      console.log('[sharepic_headline] Single item mainSlogan:', JSON.stringify(mainSlogan));

      // Check if headline needs shortening (6-12 chars per line)
      const needsShortening = mainSlogan.line1.length > 12 || mainSlogan.line2.length > 12 || mainSlogan.line3.length > 12;

      if (needsShortening) {
        console.log('[sharepic_headline] Lines too long, using shortener');
        try {
          const shortenedResult = await aiShortenerService.shortenSharepicText('headline', mainSlogan, req);
          mainSlogan = shortenedResult;
          console.log('[sharepic_headline] Headlines shortened successfully:', JSON.stringify(shortenedResult));
        } catch (shortenerError) {
          console.error('[sharepic_headline] Shortener error:', shortenerError);
          // Fallback truncation
          mainSlogan.line1 = mainSlogan.line1.substring(0, 9) + '...';
          mainSlogan.line2 = mainSlogan.line2.substring(0, 9) + '...';
          mainSlogan.line3 = mainSlogan.line3.substring(0, 9) + '...';
        }
      }

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

      // Apply shortener to all headlines if needed (6-12 chars per line)
      for (let i = 0; i < headlines.length; i++) {
        const headline = headlines[i];
        const needsShortening = headline.line1.length > 12 || headline.line2.length > 12 || headline.line3.length > 12;

        if (needsShortening) {
          console.log(`[sharepic_headline] Headline ${i} too long, using shortener`);
          try {
            const shortenedResult = await aiShortenerService.shortenSharepicText('headline', headline, req);
            headlines[i] = shortenedResult;
          } catch (shortenerError) {
            console.error(`[sharepic_headline] Shortener error for headline ${i}:`, shortenerError);
            // Fallback truncation
            headlines[i].line1 = headline.line1.substring(0, 9) + '...';
            headlines[i].line2 = headline.line2.substring(0, 9) + '...';
            headlines[i].line3 = headline.line3.substring(0, 9) + '...';
          }
        }
      }

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
  console.log('[sharepic_info] Processing request directly');

  const { thema, details, count = 5 } = req.body;
  const singleItem = count === 1;

  const config = prompts.info;
  const systemRole = config.systemRole;

  const getInfoRequestTemplate = () => {
    const template = singleItem ? config.singleItemTemplate : config.requestTemplate;
    return replaceTemplate(template, { thema, details });
  };

  try {
    let attempts = 0;
    const maxAttempts = 3;
    let responseData = null;

    // Retry loop for AI generation
    while (attempts < maxAttempts && !responseData) {
      attempts++;
      console.log(`[sharepic_info] Attempt ${attempts}/${maxAttempts}`);

      const currentRequestTemplate = getInfoRequestTemplate();

      const result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_info',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: currentRequestTemplate }],
        options: config.options
      }, req);

      if (!result.success) {
        console.error(`[sharepic_info] AI Worker error on attempt ${attempts}:`, result.error);
        if (attempts === maxAttempts) {
          return res.status(500).json({ success: false, error: result.error });
        }
        continue;
      }

      // Adaptive parsing based on requested format
      const content = result.content;

      if (singleItem) {
        // Parse JSON response for single item
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const rawJson = jsonMatch[0];
            const repairedJson = repairJsonString(rawJson);
            const infoData = JSON.parse(repairedJson);

            const header = sanitizeInfoField(infoData.header);
            const subheader = sanitizeInfoField(infoData.subheader);
            const body = sanitizeInfoField(infoData.body);
            const searchTerm = sanitizeInfoField(infoData.searchTerm);

            // Validate required fields
            if (!header || !subheader || !body) {
              throw new Error('Missing required fields in JSON response');
            }

            // Validate character lengths
            const infoForValidation = { header, subheader, body };
            if (!isInfoValid(infoForValidation)) {
              console.log(`[sharepic_info] Attempt ${attempts} failed character validation`);
              if (attempts === maxAttempts) {
                console.log(`[sharepic_info] Max attempts reached, trying AI shortener fallback`);

                // Try AI shortener as fallback
                try {
                  const shortenedInfo = await aiShortenerService.shortenSharepicText('info', infoForValidation, req);

                  if (isInfoValid(shortenedInfo)) {
                    console.log(`[sharepic_info] AI shortener successful`);
                    responseData = {
                      success: true,
                      header: shortenedInfo.header,
                      subheader: shortenedInfo.subheader,
                      body: shortenedInfo.body,
                      alternatives: [],
                      searchTerms: shortenedInfo.searchTerm ? [shortenedInfo.searchTerm] : []
                    };
                    break; // Exit the retry loop
                  }
                } catch (shortenerError) {
                  console.error(`[sharepic_info] AI shortener error:`, shortenerError);
                }

                console.error(`[sharepic_info] Failed to generate valid info after ${maxAttempts} attempts and AI shortener`);
                return res.status(500).json({
                  success: false,
                  error: `Failed to generate info with correct character limits after ${maxAttempts} attempts and AI shortener`
                });
              }
              // Continue to next attempt
              continue;
            }

            console.log(`[sharepic_info] Attempt ${attempts} successful with valid character lengths`);
            console.log('[sharepic_info] Successfully parsed single item JSON:', {
              header,
              subheader,
              body,
              searchTerm
            });

            responseData = {
              success: true,
              header,
              subheader,
              body,
              alternatives: [], // No alternatives for single item
              searchTerms: searchTerm ? [searchTerm] : []
            };
          } else {
            throw new Error('No JSON found in single item response');
          }
        } catch (parseError) {
          console.error(`[sharepic_info] Failed to parse single item JSON on attempt ${attempts}:`, parseError.message);
          if (attempts === maxAttempts) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const previewSource = jsonMatch ? repairJsonString(jsonMatch[0]) : content;
            const preview = typeof previewSource === 'string'
              ? previewSource.replace(/\s+/g, ' ').slice(0, 200)
              : '';
            const previewSuffix = previewSource && previewSource.length > 200 ? '…' : '';

            console.error('[sharepic_info] Raw content preview:', preview);
            return res.status(500).json({
              success: false,
              error: `Single item parsing failed after ${maxAttempts} attempts: ${parseError.message}. Snippet: ${preview}${previewSuffix}`
            });
          }
          // Continue to next attempt
          continue;
        }
      } else {
        // Parse multiple items using existing regex (backward compatibility)
        const infos = [];
        const searchTermMatch = content.match(/Suchbegriff[^:]*:(.+?)(?:\n|$)/i);
        const searchTerms = searchTermMatch ? [searchTermMatch[1].trim()] : [];

        // Extract info items
        const infoMatches = content.matchAll(/Info \d+:\s*\nHeader:\s*([^\n]+)\s*\nSubheader:\s*([^\n]+)\s*\nBody:\s*([^\n]+)/gi);
        for (const match of infoMatches) {
          infos.push({
            header: match[1].trim(),
            subheader: match[2].trim(),
            body: match[3].trim()
          });
        }

        // Format for frontend - first item as main, rest as alternatives
        const firstInfo = infos[0] || { header: '', subheader: '', body: '' };
        const alternatives = infos.slice(1);

        responseData = {
          success: true,
          header: firstInfo.header,
          subheader: firstInfo.subheader,
          body: firstInfo.body,
          alternatives: alternatives,
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
  console.log('[sharepic_default] Processing request for 3 default sharepics');

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
