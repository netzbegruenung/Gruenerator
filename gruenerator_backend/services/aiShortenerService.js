// Universal AI Shortener Service for Sharepic text types
// Fallback service to ensure all sharepic text meets character limits

/**
 * Helper function to clean AI response from unwanted formatting
 */
const cleanAIResponse = (content) => {
  if (!content || typeof content !== 'string') {
    return '';
  }

  return content
    .replace(/^\d+\.\s*\*?["„]?/g, '') // Remove numbers, asterisks, quotes at start
    .replace(/["„]?\*?\s*\(\d+\s*Zeichen\)\s*$/g, '') // Remove character counts at end
    .replace(/["„]?\*?\s*$/g, '') // Remove trailing quotes/asterisks
    .replace(/\*\*.*?\*\*/g, '') // Remove markdown bold
    .replace(/^\*?["„]?/g, '') // Remove leading asterisks/quotes
    .replace(/["„]?\*?$/g, '') // Remove trailing quotes/asterisks
    .trim();
};

/**
 * Character limits for each sharepic type
 */
const CHARACTER_LIMITS = {
  dreizeilen: {
    line1: 15,
    line2: 15,
    line3: 15
  },
  headline: {
    line1: 12,
    line2: 12,
    line3: 12
  },
  zitat: {
    quote: 140
  },
  zitat_pure: {
    quote: { min: 100, max: 160 }
  },
  info: {
    header: { min: 50, max: 60 },
    subheader: { min: 80, max: 120 },
    body: { min: 150, max: 250 }
  }
};

/**
 * Shortens text for dreizeilen type (3 lines with max 15 chars each)
 */
const shortenDreizeilen = async (data, req) => {
  console.log('[aiShortener] Shortening dreizeilen:', JSON.stringify(data));

  // Check if all lines are empty or missing - return early to avoid generating error messages
  if (!data.line1 && !data.line2 && !data.line3) {
    console.log('[aiShortener] All lines are empty, returning empty data as-is');
    return {
      line1: data.line1 || '',
      line2: data.line2 || '',
      line3: data.line3 || ''
    };
  }

  const prompt = `Kürze diese drei Zeilen auf MAXIMAL 15 Zeichen pro Zeile:
Zeile 1: "${data.line1}"
Zeile 2: "${data.line2}"
Zeile 3: "${data.line3}"

WICHTIG:
- Jede Zeile MAXIMAL 15 Zeichen (inklusive Leerzeichen)
- Kein Markdown, keine Formatierung
- Gib nur die drei gekürzten Zeilen zurück

Format:
Zeile 1
Zeile 2
Zeile 3`;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_shortener',
      systemPrompt: 'Du bist ein Textkürzungsexperte. Kürze Texte exakt nach Vorgabe.',
      messages: [{ role: 'user', content: prompt }],
      options: { max_tokens: 200, temperature: 0.1, top_p: 0.5, provider: 'claude' }
    }, req);

    if (!result.success) {
      console.error('[aiShortener] Failed to shorten dreizeilen:', result.error);
      return fallbackTruncate('dreizeilen', data);
    }

    // Parse the response
    const lines = result.content.split('\n').filter(line => line.trim()).slice(0, 3);
    const shortened = {
      line1: (lines[0] || data.line1).trim().substring(0, 15),
      line2: (lines[1] || data.line2).trim().substring(0, 15),
      line3: (lines[2] || data.line3).trim().substring(0, 15)
    };

    console.log('[aiShortener] Dreizeilen shortened successfully:', JSON.stringify(shortened));
    return shortened;

  } catch (error) {
    console.error('[aiShortener] Error shortening dreizeilen:', error);
    return fallbackTruncate('dreizeilen', data);
  }
};

/**
 * Shortens text for headline type (3 lines with 6-12 chars each)
 */
const shortenHeadline = async (data, req) => {
  console.log('[aiShortener] Shortening headline:', JSON.stringify(data));

  // Check if all lines are empty or missing - return early to avoid generating error messages
  if (!data.line1 && !data.line2 && !data.line3) {
    console.log('[aiShortener] All headline lines are empty, returning empty data as-is');
    return {
      line1: data.line1 || '',
      line2: data.line2 || '',
      line3: data.line3 || ''
    };
  }

  const prompt = `Kürze diese drei Zeilen auf 6-12 Zeichen pro Zeile für eine kraftvolle Headline:
Zeile 1: "${data.line1}"
Zeile 2: "${data.line2}"
Zeile 3: "${data.line3}"

WICHTIG:
- Jede Zeile 6-12 Zeichen (inklusive Leerzeichen)
- Kraftvolle, emotionale Begriffe
- Kein Markdown, keine Formatierung
- Gib nur die drei gekürzten Zeilen zurück

Format:
Zeile 1
Zeile 2
Zeile 3`;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_shortener',
      systemPrompt: 'Du bist ein Textkürzungsexperte. Kürze Texte exakt nach Vorgabe.',
      messages: [{ role: 'user', content: prompt }],
      options: { max_tokens: 200, temperature: 0.1, top_p: 0.5, provider: 'claude' }
    }, req);

    if (!result.success) {
      console.error('[aiShortener] Failed to shorten headline:', result.error);
      return fallbackTruncate('headline', data);
    }

    // Parse the response
    const lines = result.content.split('\n').filter(line => line.trim()).slice(0, 3);
    const shortened = {
      line1: (lines[0] || data.line1).trim().substring(0, 12),
      line2: (lines[1] || data.line2).trim().substring(0, 12),
      line3: (lines[2] || data.line3).trim().substring(0, 12)
    };

    console.log('[aiShortener] Headline shortened successfully:', JSON.stringify(shortened));
    return shortened;

  } catch (error) {
    console.error('[aiShortener] Error shortening headline:', error);
    return fallbackTruncate('headline', data);
  }
};

/**
 * Shortens quote for zitat type (max 140 chars)
 */
const shortenZitat = async (data, req) => {
  console.log('[aiShortener] Shortening zitat:', data.quote?.substring(0, 50) + '...');

  // Check if quote is empty or missing - return early to avoid generating error messages
  if (!data.quote || data.quote.trim() === '') {
    console.log('[aiShortener] Quote is empty, returning empty data as-is');
    return {
      ...data,
      quote: data.quote || ''
    };
  }

  const prompt = `Kürze dieses Zitat auf MAXIMAL 140 Zeichen:
"${data.quote}"

WICHTIG:
- Maximal 140 Zeichen
- Behalt die Kernaussage bei
- Keine Hashtags
- Keine Nummerierung oder Aufzählung
- Keine Anführungszeichen oder Sterne
- Keine Zeichenzahlen in Klammern
- Gib nur den sauberen Zitattext zurück`;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_shortener',
      systemPrompt: 'Du bist ein Textkürzungsexperte. Kürze Texte exakt nach Vorgabe.',
      messages: [{ role: 'user', content: prompt }],
      options: { max_tokens: 200, temperature: 0.1, top_p: 0.5, provider: 'claude' }
    }, req);

    if (!result.success) {
      console.error('[aiShortener] Failed to shorten zitat:', result.error);
      return fallbackTruncate('zitat', data);
    }

    const shortened = {
      ...data,
      quote: cleanAIResponse(result.content).substring(0, 140)
    };

    console.log('[aiShortener] Zitat shortened successfully to', shortened.quote.length, 'chars');
    return shortened;

  } catch (error) {
    console.error('[aiShortener] Error shortening zitat:', error);
    return fallbackTruncate('zitat', data);
  }
};

/**
 * Shortens quote for zitat_pure type (100-160 chars)
 */
const shortenZitatPure = async (data, req) => {
  console.log('[aiShortener] Shortening zitat_pure:', data.quote?.substring(0, 50) + '...');

  // Check if quote is empty or missing - return early to avoid generating error messages
  if (!data.quote || data.quote.trim() === '') {
    console.log('[aiShortener] Zitat_pure quote is empty, returning empty data as-is');
    return {
      ...data,
      quote: data.quote || ''
    };
  }

  const prompt = `Kürze dieses Zitat auf EXAKT 100-160 Zeichen:
"${data.quote}"

WICHTIG:
- Zwischen 100-160 Zeichen
- Behalt die Kernaussage bei
- Keine Hashtags
- Keine Nummerierung oder Aufzählung
- Keine Anführungszeichen oder Sterne
- Keine Zeichenzahlen in Klammern
- Gib nur den sauberen Zitattext zurück`;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_shortener',
      systemPrompt: 'Du bist ein Textkürzungsexperte. Kürze Texte exakt nach Vorgabe.',
      messages: [{ role: 'user', content: prompt }],
      options: { max_tokens: 300, temperature: 0.1, top_p: 0.5, provider: 'claude' }
    }, req);

    if (!result.success) {
      console.error('[aiShortener] Failed to shorten zitat_pure:', result.error);
      return fallbackTruncate('zitat_pure', data);
    }

    let shortened = cleanAIResponse(result.content);

    // Ensure it's within 100-160 range
    if (shortened.length < 100) {
      // If too short, try to expand or use fallback
      shortened = data.quote.substring(0, 160);
    } else if (shortened.length > 160) {
      shortened = shortened.substring(0, 157) + '...';
    }

    const result_data = {
      ...data,
      quote: shortened
    };

    console.log('[aiShortener] Zitat_pure shortened successfully to', result_data.quote.length, 'chars');
    return result_data;

  } catch (error) {
    console.error('[aiShortener] Error shortening zitat_pure:', error);
    return fallbackTruncate('zitat_pure', data);
  }
};

/**
 * Shortens info components (header: 50-60, subheader: 80-120, body: 150-250)
 */
const shortenInfo = async (data, req) => {
  console.log('[aiShortener] Shortening info:', {
    header: data.header?.length,
    subheader: data.subheader?.length,
    body: data.body?.length
  });

  // Check if all info components are empty - return early to avoid generating error messages
  if ((!data.header || data.header.trim() === '') &&
      (!data.subheader || data.subheader.trim() === '') &&
      (!data.body || data.body.trim() === '')) {
    console.log('[aiShortener] All info components are empty, returning empty data as-is');
    return {
      header: data.header || '',
      subheader: data.subheader || '',
      body: data.body || '',
      searchTerm: data.searchTerm || ''
    };
  }

  const prompt = `Kürze diese Info-Komponenten auf die exakten Zeichenlimits:

Header (50-60 Zeichen): "${data.header}"
Subheader (80-120 Zeichen): "${data.subheader}"
Body (150-250 Zeichen): "${data.body}"

WICHTIG:
- Header: EXAKT 50-60 Zeichen
- Subheader: EXAKT 80-120 Zeichen
- Body: EXAKT 150-250 Zeichen
- Behalt die Kernaussagen bei
- Gib nur die drei gekürzten Texte zurück

Format:
HEADER: [gekürzter Header]
SUBHEADER: [gekürzter Subheader]
BODY: [gekürzter Body]`;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_shortener',
      systemPrompt: 'Du bist ein Textkürzungsexperte. Kürze Texte exakt nach Vorgabe.',
      messages: [{ role: 'user', content: prompt }],
      options: { max_tokens: 500, temperature: 0.1, top_p: 0.5, provider: 'claude' }
    }, req);

    if (!result.success) {
      console.error('[aiShortener] Failed to shorten info:', result.error);
      return fallbackTruncate('info', data);
    }

    // Parse the response
    const content = result.content;
    const headerMatch = content.match(/HEADER:\s*(.+?)(?=\n|$)/);
    const subheaderMatch = content.match(/SUBHEADER:\s*(.+?)(?=\n|$)/);
    const bodyMatch = content.match(/BODY:\s*(.+?)(?=\n|$)/);

    const shortened = {
      header: (headerMatch?.[1] || data.header).trim().substring(0, 60),
      subheader: (subheaderMatch?.[1] || data.subheader).trim().substring(0, 120),
      body: (bodyMatch?.[1] || data.body).trim().substring(0, 250),
      searchTerm: data.searchTerm || ''
    };

    // Ensure minimum lengths
    if (shortened.header.length < 50) {
      shortened.header = data.header.substring(0, 60);
    }
    if (shortened.subheader.length < 80) {
      shortened.subheader = data.subheader.substring(0, 120);
    }
    if (shortened.body.length < 150) {
      shortened.body = data.body.substring(0, 250);
    }

    console.log('[aiShortener] Info shortened successfully:', {
      header: shortened.header.length,
      subheader: shortened.subheader.length,
      body: shortened.body.length
    });

    return shortened;

  } catch (error) {
    console.error('[aiShortener] Error shortening info:', error);
    return fallbackTruncate('info', data);
  }
};

/**
 * Fallback truncation when AI shortener fails
 */
const fallbackTruncate = (type, data) => {
  console.log('[aiShortener] Using fallback truncation for', type);

  switch (type) {
    case 'dreizeilen':
      return {
        line1: (data.line1 || '').substring(0, 12) + '...',
        line2: (data.line2 || '').substring(0, 12) + '...',
        line3: (data.line3 || '').substring(0, 12) + '...'
      };

    case 'headline':
      return {
        line1: (data.line1 || '').substring(0, 9) + '...',
        line2: (data.line2 || '').substring(0, 9) + '...',
        line3: (data.line3 || '').substring(0, 9) + '...'
      };

    case 'zitat':
      return {
        ...data,
        quote: (data.quote || '').substring(0, 137) + '...'
      };

    case 'zitat_pure':
      const originalLength = (data.quote || '').length;
      let truncated = data.quote || '';

      if (originalLength > 160) {
        truncated = truncated.substring(0, 157) + '...';
      } else if (originalLength < 100) {
        // If too short, just use as is - better than nothing
        truncated = truncated;
      }

      return {
        ...data,
        quote: truncated
      };

    case 'info':
      return {
        header: (data.header || '').substring(0, 57) + '...',
        subheader: (data.subheader || '').substring(0, 117) + '...',
        body: (data.body || '').substring(0, 247) + '...',
        searchTerm: data.searchTerm || ''
      };

    default:
      return data;
  }
};

/**
 * Main shortener function - handles all sharepic types
 */
const shortenSharepicText = async (type, data, req) => {
  console.log(`[aiShortener] Starting shortening for type: ${type}`);

  if (!data || !req) {
    console.error('[aiShortener] Missing data or req parameter');
    return data;
  }

  try {
    switch (type) {
      case 'dreizeilen':
        return await shortenDreizeilen(data, req);

      case 'headline':
        return await shortenHeadline(data, req);

      case 'zitat':
        return await shortenZitat(data, req);

      case 'zitat_pure':
        return await shortenZitatPure(data, req);

      case 'info':
        return await shortenInfo(data, req);

      default:
        console.warn(`[aiShortener] Unknown type: ${type}`);
        return data;
    }
  } catch (error) {
    console.error(`[aiShortener] Error in shortenSharepicText for ${type}:`, error);
    return fallbackTruncate(type, data);
  }
};

module.exports = {
  shortenSharepicText,
  CHARACTER_LIMITS
};