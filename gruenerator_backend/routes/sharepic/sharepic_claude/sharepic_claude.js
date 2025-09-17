const express = require('express');
const router = express.Router();

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

// Handler for dreizeilen type
const handleDreizeilenRequest = async (req, res) => {
  console.log('[sharepic_dreizeilen] Processing request directly');

  const { thema, details, line1, line2, line3 } = req.body;

  const systemRole = "Du bist ein erfahrener Texter für Bündnis 90/Die Grünen. Deine Aufgabe ist es, kurze, prägnante Slogans für Sharepics zu erstellen.";

  let requestTemplate = `<context>
Du bist ein erfahrener Texter für Bündnis 90/Die Grünen. Deine Aufgabe ist es, kurze, prägnante Slogans für Sharepics zu erstellen.
</context>

<instructions>
Erstelle 5 verschiedene prägnante, zusammenhängende Slogans zum gegebenen Thema. Jeder Slogan soll:
- Einen durchgängigen Gedanken oder eine Botschaft über drei Zeilen vermitteln
- Die Werte der Grünen widerspiegeln
- Inspirierend und zukunftsorientiert sein
- Für eine breite Zielgruppe geeignet sein
- Fachbegriffe und komplexe Satzkonstruktionen vermeiden
</instructions>

<format>
- Formuliere jeden Slogan als einen zusammenhängenden Satz oder Gedanken
- Teile jeden Satz auf drei Zeilen auf
- Maximal 15 Zeichen pro Zeile, inklusive Leerzeichen
- Die Slogans sollten auch beim Lesen über die Zeilenumbrüche hinweg Sinn ergeben und flüssig sein
- Vermeide Bindestriche oder andere Satzzeichen am Ende der Zeilen
- Gib die Slogans im Format "Slogan 1:", "Slogan 2:" etc. aus
- Schlage zusätzlich ein Wort als Suchbegriff für ein passendes Unsplash-Hintergrundbild vor
- Das Bild soll präzise zum Thema passen
</format>

<task>`;

  if (thema && details) {
    requestTemplate += `
Erstelle nun fünf verschiedene Slogans basierend auf folgendem Input:
<input>
Thema: ${thema}
Details: ${details}
</input>`;
  } else {
    requestTemplate += `
Optimiere diese Zeilen zu fünf verschiedenen Slogans:
<input>
Zeile 1: ${line1 || ''}
Zeile 2: ${line2 || ''}
Zeile 3: ${line3 || ''}
</input>`;
  }

  requestTemplate += `
</task>`;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_dreizeilen',
      systemPrompt: systemRole,
      messages: [{ role: 'user', content: requestTemplate }],
      options: { max_tokens: 4000, temperature: 1.0 }
    }, req);

    if (!result.success) {
      console.error('[sharepic_dreizeilen] AI Worker error:', result.error);
      return res.status(500).json({ success: false, error: result.error });
    }

    // Parse response to extract slogans and search terms
    const content = result.content;
    const slogans = [];
    const searchTermMatch = content.match(/Suchbegriff[^:]*:(.+?)(?:\n|$)/i);
    const searchTerms = searchTermMatch ? [searchTermMatch[1].trim()] : [];

    // Extract slogans
    const sloganMatches = content.matchAll(/Slogan \d+:\s*\n([^\n]+)\n([^\n]+)\n([^\n]+)/g);
    for (const match of sloganMatches) {
      slogans.push({
        line1: match[1].trim(),
        line2: match[2].trim(),
        line3: match[3].trim()
      });
    }

    // Format for frontend
    const mainSlogan = slogans[0] || { line1: '', line2: '', line3: '' };
    const alternatives = slogans.slice(1);

    res.json({
      success: true,
      mainSlogan: mainSlogan,
      alternatives: alternatives,
      searchTerms: searchTerms
    });
  } catch (error) {
    console.error('[sharepic_dreizeilen] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Handler for zitat type
const handleZitatRequest = async (req, res) => {
  console.log('[sharepic_zitat] Processing request directly');

  const { thema, details, quote, name } = req.body;

  const systemRole = "Du bist ein erfahrener Social-Media-Manager für Bündnis 90/Die Grünen. Deine Aufgabe ist es, prägnante und aussagekräftige Zitate mit maximal 140 Zeichen im Stil von Bündnis 90/Die Grünen zu erstellen. Die Zitate sollen KEINE Hashtags enthalten und als klare, lesbare Aussagen formuliert sein. Gib die Zitate immer als JSON-Array zurück.";

  let requestTemplate;
  if (thema && details) {
    requestTemplate = `Erstelle 4 verschiedene Zitate zum Thema "${thema}" basierend auf folgenden Details: ${details}. Ist unter Details kein Inhalt, nimm nur das Thema. Die Zitate sollen KEINE Hashtags enthalten und als klare, aussagekräftige Statements formuliert sein. Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat.`;
  } else {
    requestTemplate = `Optimiere folgendes Zitat: "${quote}" und erstelle 3 weitere Varianten. Die Zitate sollen KEINE Hashtags enthalten und als klare, aussagekräftige Statements formuliert sein. Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat.`;
  }

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_zitat',
      systemPrompt: systemRole,
      messages: [{ role: 'user', content: requestTemplate }],
      options: { max_tokens: 1000, temperature: 0.7 }
    }, req);

    if (!result.success) {
      console.error('[sharepic_zitat] AI Worker error:', result.error);
      return res.status(500).json({ success: false, error: result.error });
    }

    // Parse the AI response to extract quotes
    let quotes = extractQuoteArray(result.content);
    if (!quotes || quotes.length === 0) {
      quotes = [{ quote: (result.content || '').trim() }];
    } else {
      quotes = quotes.map((item) =>
        typeof item === 'string' ? { quote: item } : item
      );
    }

    // Format response for frontend
    const firstQuote = quotes[0]?.quote || (result.content || '').trim();
    const alternatives = quotes.slice(1);

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

  const { thema, details, quote, name } = req.body;

  const systemRole = "Du bist ein erfahrener Social-Media-Manager für Bündnis 90/Die Grünen. Deine Aufgabe ist es, prägnante und aussagekräftige Zitate mit exakt 100-160 Zeichen im Stil von Bündnis 90/Die Grünen zu erstellen. Die Zitate sollen KEINE Hashtags enthalten und als klare, lesbare Aussagen formuliert sein. Achte penibel auf die Zeichenzahl! Gib die Zitate immer als JSON-Array zurück.";

  let requestTemplate;
  if (thema && details) {
    requestTemplate = `Erstelle 4 verschiedene Zitate zum Thema "${thema}" basierend auf folgenden Details: ${details}. Ist unter Details kein Inhalt, nimm nur das Thema. Die Zitate sollen:
- Exakt 100-160 Zeichen lang sein (inklusive Leerzeichen und Satzzeichen)
- KEINE Hashtags enthalten
- Als klare, aussagekräftige Statements formuliert sein
- Perfekt für das grüne Farbtemplate geeignet sein
- Vollständige, bedeutungsvolle Aussagen sein
Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat. WICHTIG: Zähle die Zeichen genau!`;
  } else {
    requestTemplate = `Optimiere folgendes Zitat: "${quote}" und erstelle 3 weitere Varianten. Die Zitate sollen:
- Exakt 100-160 Zeichen lang sein (inklusive Leerzeichen und Satzzeichen)
- KEINE Hashtags enthalten
- Als klare, aussagekräftige Statements formuliert sein
- Perfekt für das grüne Farbtemplate geeignet sein
- Vollständige, bedeutungsvolle Aussagen sein
Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat. WICHTIG: Zähle die Zeichen genau!`;
  }

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_zitat_pure',
      systemPrompt: systemRole,
      messages: [{ role: 'user', content: requestTemplate }],
      options: { max_tokens: 1000, temperature: 0.7 }
    }, req);

    if (!result.success) {
      console.error('[sharepic_zitat_pure] AI Worker error:', result.error);
      return res.status(500).json({ success: false, error: result.error });
    }

    // Parse the AI response to extract quotes
    let quotes = extractQuoteArray(result.content);
    if (!quotes || quotes.length === 0) {
      quotes = [{ quote: (result.content || '').trim() }];
    } else {
      quotes = quotes.map((item) =>
        typeof item === 'string' ? { quote: item } : item
      );
    }

    // Format response for frontend
    const firstQuote = quotes[0]?.quote || (result.content || '').trim();
    const alternatives = quotes.slice(1);

    res.json({
      success: true,
      quote: firstQuote,
      alternatives: alternatives,
      name: name || ''
    });
  } catch (error) {
    console.error('[sharepic_zitat_pure] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Handler for headline type
const handleHeadlineRequest = async (req, res) => {
  console.log('[sharepic_headline] Processing request directly');

  const { thema, details, line1, line2, line3 } = req.body;

  const systemRole = "Du bist ein erfahrener Headline-Texter für Bündnis 90/Die Grünen. Deine Aufgabe ist es, kraftvolle, prägnante Headlines zu erstellen.";

  let requestTemplate = `<context>
Du bist ein erfahrener Headline-Texter für Bündnis 90/Die Grünen. Deine Aufgabe ist es, kraftvolle, prägnante Headlines für Sharepics zu erstellen.
</context>

<instructions>
Erstelle 5 verschiedene kraftvolle Headlines zum gegebenen Thema. Jede Headline soll:
- Exakt 3 Zeilen haben
- Pro Zeile 6-12 Zeichen (inklusive Leerzeichen)
- Sehr kraftvoll und direkt sein
- Die grüne Botschaft klar vermitteln
- Emotional aktivierend wirken
- Einfache, starke Worte verwenden
- Perfekt für große, fette Schrift geeignet sein
</instructions>

<format>
- Jede Headline besteht aus exakt 3 Zeilen
- 6-12 Zeichen pro Zeile (inklusive Leerzeichen)
- Verwende starke, emotionale Begriffe
- Gib die Headlines im Format "Headline 1:", "Headline 2:" etc. aus
- Schlage zusätzlich einen Suchbegriff für ein passendes Unsplash-Hintergrundbild vor
- WICHTIG: Zähle die Zeichen pro Zeile genau (6-12 Zeichen)!
</format>

<task>`;

  if (thema && details) {
    requestTemplate += `
Erstelle nun fünf verschiedene Headlines basierend auf folgendem Input:
<input>
Thema: ${thema}
Details: ${details}
</input>`;
  } else {
    requestTemplate += `
Optimiere diese Zeilen zu fünf verschiedenen Headlines:
<input>
Zeile 1: ${line1 || ''}
Zeile 2: ${line2 || ''}
Zeile 3: ${line3 || ''}
</input>`;
  }

  requestTemplate += `
</task>`;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_headline',
      systemPrompt: systemRole,
      messages: [{ role: 'user', content: requestTemplate }],
      options: { max_tokens: 2000, temperature: 0.8 }
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

    // Extract headlines
    const headlineMatches = content.matchAll(/Headline \d+:\s*\n([^\n]+)\n([^\n]+)\n([^\n]+)/g);
    for (const match of headlineMatches) {
      headlines.push({
        line1: match[1].trim(),
        line2: match[2].trim(),
        line3: match[3].trim()
      });
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
  } catch (error) {
    console.error('[sharepic_headline] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Handler for info type
const handleInfoRequest = async (req, res) => {
  console.log('[sharepic_info] Processing request directly');

  const { thema, details } = req.body;

  const systemRole = "Du bist ein erfahrener Kommunikationsexperte für Bündnis 90/Die Grünen. Deine Aufgabe ist es, strukturierte, informative Inhalte zu erstellen.";

  let requestTemplate = `<context>
Du bist ein erfahrener Kommunikationsexperte für Bündnis 90/Die Grünen. Deine Aufgabe ist es, strukturierte Informations-Inhalte für Sharepics zu erstellen.
</context>

<instructions>
Erstelle 5 verschiedene strukturierte Info-Inhalte zum gegebenen Thema. Jeder Info-Inhalt soll:
- Einen Header: Die Hauptaussage/Behauptung (50-60 Zeichen)
- Einen Subheader: Schlüsselfakt oder wichtigster Beleg (80-120 Zeichen)
- Einen Body: Zusätzliche Details und Kontext (150-250 Zeichen)
- Sachlich aber engaging sein
- Die grüne Position klar vermitteln
- Faktisch fundiert und verständlich sein
</instructions>

<format>
- Header: Hauptaussage (50-60 Zeichen)
- Subheader: Wichtigster Beleg/Fakt (80-120 Zeichen)
- Body: Zusätzliche Details (150-250 Zeichen)
- Gib die Info-Inhalte im Format "Info 1:", "Info 2:" etc. aus
- Schlage zusätzlich einen Suchbegriff für ein passendes Unsplash-Hintergrundbild vor
- Halte dich an die Zeichenvorgaben, aber gib diese NICHT im Text aus
</format>

<task>`;

  if (thema && details) {
    requestTemplate += `
Erstelle nun fünf verschiedene Info-Inhalte basierend auf folgendem Input:
<input>
Thema: ${thema}
Details: ${details}
</input>`;
  } else {
    requestTemplate += `
Erstelle Info-Inhalte basierend auf diesem Thema: ${thema || 'Umweltschutz'}`;
  }

  requestTemplate += `
</task>`;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'sharepic_info',
      systemPrompt: systemRole,
      messages: [{ role: 'user', content: requestTemplate }],
      options: { max_tokens: 3000, temperature: 0.8 }
    }, req);

    if (!result.success) {
      console.error('[sharepic_info] AI Worker error:', result.error);
      return res.status(500).json({ success: false, error: result.error });
    }

    // Parse response to extract info items and search terms
    const content = result.content;
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

    res.json({
      success: true,
      header: firstInfo.header,
      subheader: firstInfo.subheader,
      body: firstInfo.body,
      alternatives: alternatives,
      searchTerms: searchTerms
    });
  } catch (error) {
    console.error('[sharepic_info] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Unified handler for backward compatibility
const handleClaudeRequest = async (req, res, type = 'dreizeilen') => {
  switch (type) {
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
