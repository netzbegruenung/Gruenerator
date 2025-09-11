const express = require('express');
const router = express.Router();
const { formatUserContent } = require('../../../utils/promptUtils');
const { 
  processAndBuildAttachments,
  hasValidAttachments
} = require('../../../utils/attachmentUtils');
const { 
  PromptBuilderWithExamples 
} = require('../../../utils/promptBuilderCompat');

// Unified handler for all sharepic types: dreizeilen, zitat, headline, info
const handleClaudeRequest = async (req, res, type = 'dreizeilen') => {
  const logPrefix = `[${type.charAt(0).toUpperCase() + type.slice(1)}-Claude API]`;
  console.log(`${logPrefix} Received request:`, req.body);
  
  const { thema, details, line1, line2, line3, quote, name, customPrompt, attachments, usePrivacyMode, provider } = req.body;
  
  if (customPrompt) {
    console.log(`${logPrefix} Using custom prompt (knowledge) with length:`, customPrompt.length);
  }

  // Process attachments if provided
  let attachmentResult = { documents: [], error: null, hasAttachments: false };
  if (hasValidAttachments(attachments)) {
    attachmentResult = await processAndBuildAttachments(
      attachments,
      usePrivacyMode,
      `sharepic_${type}`,
      req.user?.id || 'unknown'
    );

    if (attachmentResult.error) {
      console.error(`${logPrefix} Attachment processing error:`, attachmentResult.error);
      return res.status(400).json({
        success: false,
        error: 'Fehler bei der Verarbeitung der Anhänge',
        details: attachmentResult.error
      });
    }

    console.log(`${logPrefix} Processed ${attachmentResult.documents.length} attachments`);
  }

  try {
    console.log(`${logPrefix} Preparing request to Claude API`);
    
    // Generate type-specific prompt and AI request parameters
    let aiRequest;
    
    if (type === 'dreizeilen') {
      // Use PromptBuilder for better structure and attachment support
      const builder = new PromptBuilderWithExamples('sharepic_dreizeilen')
        .setSystemRole('Du bist ein erfahrener Texter für Bündnis 90/Die Grünen. Deine Aufgabe ist es, kurze, prägnante Slogans für Sharepics zu erstellen.');

      // Add documents if present
      if (attachmentResult.documents.length > 0) {
        await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
      }

      // Add custom instructions if present
      if (customPrompt) {
        builder.setInstructions(customPrompt);
      }

      const baseXmlPrompt = `
<context>
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

<examples>
<example>
<input>
Thema: Klimaschutz
Details: Fokus auf erneuerbare Energien
</input>
<output>
Slogan 1:
Grüne Energie
gestaltet heute
unsere Zukunft

Slogan 2:
Sonnenkraft und
Windenergie
bewegen uns

Slogan 3:
Klimaschutz ist
der Weg in die
neue Zukunft

Slogan 4:
Gemeinsam für
saubere Kraft
von morgen

Slogan 5:
Naturenergie
schafft Wandel
für uns alle

Suchbegriff: Windkraft, Solaranlage
</output>
</example>
</examples>

<task>
${thema && details 
  ? `Erstelle nun fünf verschiedene Slogans basierend auf folgendem Input:
<input>
Thema: ${thema}
Details: ${details}
</input>`
  : `Optimiere diese Zeilen zu fünf verschiedenen Slogans:
<input>
Zeile 1: ${line1}
Zeile 2: ${line2}
Zeile 3: ${line3}
</input>`}
</task>
`;

      builder.setRequest(baseXmlPrompt);

      // Build the final prompt
      const promptResult = builder.build();

      aiRequest = {
        type: 'dreizeilen',
        usePrivacyMode: usePrivacyMode || false,
        systemPrompt: promptResult.system,
        messages: promptResult.messages,
        options: {
          max_tokens: 4000,
          temperature: 1.0,
          ...(usePrivacyMode && provider && { provider: provider })
        }
      };
    } else if (type === 'zitat') {
      // Use PromptBuilder for zitat type
      const builder = new PromptBuilderWithExamples('sharepic_zitat')
        .setSystemRole('Du bist ein erfahrener Social-Media-Manager für Bündnis 90/Die Grünen. Deine Aufgabe ist es, prägnante und aussagekräftige Zitate mit maximal 140 Zeichen im Stil von Bündnis 90/Die Grünen zu erstellen. Die Zitate sollen KEINE Hashtags enthalten und als klare, lesbare Aussagen formuliert sein. Gib die Zitate immer als JSON-Array zurück.');

      // Add documents if present
      if (attachmentResult.documents.length > 0) {
        await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
      }

      // Add custom instructions if present
      if (customPrompt) {
        builder.setInstructions(customPrompt);
      }

      const basePrompt = thema && details
        ? `Erstelle 4 verschiedene Zitate zum Thema "${thema}" basierend auf folgenden Details: ${details}. Ist unter Details kein Inhalt, nimm nur das Thema. Die Zitate sollen KEINE Hashtags enthalten und als klare, aussagekräftige Statements formuliert sein. Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat.`
        : `Optimiere folgendes Zitat: "${quote}" und erstelle 3 weitere Varianten. Die Zitate sollen KEINE Hashtags enthalten und als klare, aussagekräftige Statements formuliert sein. Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat.`;

      builder.setRequest(basePrompt);
      const promptResult = builder.build();

      aiRequest = {
        type: 'zitat',
        usePrivacyMode: usePrivacyMode || false,
        systemPrompt: promptResult.system,
        messages: promptResult.messages,
        options: {
          max_tokens: 1000,
          temperature: 0.7,
          ...(usePrivacyMode && provider && { provider: provider })
        }
      };
    } else if (type === 'zitat_pure') {
      // Use PromptBuilder for zitat_pure type
      const builder = new PromptBuilderWithExamples('sharepic_zitat_pure')
        .setSystemRole('Du bist ein erfahrener Social-Media-Manager für Bündnis 90/Die Grünen. Deine Aufgabe ist es, prägnante und aussagekräftige Zitate mit exakt 100-160 Zeichen im Stil von Bündnis 90/Die Grünen zu erstellen. Die Zitate sollen KEINE Hashtags enthalten und als klare, lesbare Aussagen formuliert sein. Achte penibel auf die Zeichenzahl! Gib die Zitate immer als JSON-Array zurück.');

      // Add documents if present
      if (attachmentResult.documents.length > 0) {
        await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
      }

      // Add custom instructions if present
      if (customPrompt) {
        builder.setInstructions(customPrompt);
      }

      const basePrompt = thema && details
        ? `Erstelle 4 verschiedene Zitate zum Thema "${thema}" basierend auf folgenden Details: ${details}. Ist unter Details kein Inhalt, nimm nur das Thema. Die Zitate sollen:
- Exakt 100-160 Zeichen lang sein (inklusive Leerzeichen und Satzzeichen)
- KEINE Hashtags enthalten
- Als klare, aussagekräftige Statements formuliert sein
- Perfekt für das grüne Farbtemplate geeignet sein
- Vollständige, bedeutungsvolle Aussagen sein
Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat. WICHTIG: Zähle die Zeichen genau!`
        : `Optimiere folgendes Zitat: "${quote}" und erstelle 3 weitere Varianten. Die Zitate sollen:
- Exakt 100-160 Zeichen lang sein (inklusive Leerzeichen und Satzzeichen)
- KEINE Hashtags enthalten
- Als klare, aussagekräftige Statements formuliert sein
- Perfekt für das grüne Farbtemplate geeignet sein
- Vollständige, bedeutungsvolle Aussagen sein
Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat. WICHTIG: Zähle die Zeichen genau!`;

      builder.setRequest(basePrompt);
      const promptResult = builder.build();

      aiRequest = {
        type: 'zitat_pure',
        usePrivacyMode: usePrivacyMode || false,
        systemPrompt: promptResult.system,
        messages: promptResult.messages,
        options: {
          max_tokens: 1000,
          temperature: 0.7,
          ...(usePrivacyMode && provider && { provider: provider })
        }
      };
    } else if (type === 'headline') {
      // Use PromptBuilder for headline type
      const builder = new PromptBuilderWithExamples('sharepic_headline')
        .setSystemRole('Du bist ein erfahrener Headline-Texter für Bündnis 90/Die Grünen. Deine Aufgabe ist es, kraftvolle, prägnante Headlines zu erstellen.');

      // Add documents if present
      if (attachmentResult.documents.length > 0) {
        await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
      }

      // Add custom instructions if present
      if (customPrompt) {
        builder.setInstructions(customPrompt);
      }

      const baseXmlPrompt = `
<context>
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

<examples>
<example>
<input>
Thema: Klimaschutz
Details: Dringlichkeit des Handelns
</input>
<output>
Headline 1:
Für eine
Zukunft
in Grün.

Headline 2:
Klima
schützen
JETZT!

Headline 3:
Grüne
Wende
heute

Headline 4:
Natur
bewahren
für alle

Headline 5:
Umwelt
retten
gemeinsam

Headline 6:
Für unsere
grüne Zukunft
kämpfen!

Suchbegriff: Klimaschutz, Umwelt
</output>
</example>
</examples>

<task>
${thema && details 
  ? `Erstelle nun fünf verschiedene Headlines basierend auf folgendem Input:
<input>
Thema: ${thema}
Details: ${details}
</input>`
  : `Optimiere diese Zeilen zu fünf verschiedenen Headlines:
<input>
Zeile 1: ${line1}
Zeile 2: ${line2}
Zeile 3: ${line3}
</input>`}
</task>
`;

      builder.setRequest(baseXmlPrompt);
      const promptResult = builder.build();

      aiRequest = {
        type: 'headline',
        usePrivacyMode: usePrivacyMode || false,
        systemPrompt: promptResult.system,
        messages: promptResult.messages,
        options: {
          max_tokens: 2000,
          temperature: 0.8,
          ...(usePrivacyMode && provider && { provider: provider })
        }
      };
    } else if (type === 'info') {
      // Use PromptBuilder for info type
      const builder = new PromptBuilderWithExamples('sharepic_info')
        .setSystemRole('Du bist ein erfahrener Kommunikationsexperte für Bündnis 90/Die Grünen. Deine Aufgabe ist es, strukturierte, informative Inhalte zu erstellen.');

      // Add documents if present
      if (attachmentResult.documents.length > 0) {
        await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
      }

      // Add custom instructions if present
      if (customPrompt) {
        builder.setInstructions(customPrompt);
      }

      const baseXmlPrompt = `
<context>
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

<examples>
<example>
<input>
Thema: Gleichstellung
Details: Fortschritte der Grünen bei Geschlechtergerechtigkeit
</input>
<output>
Info 1:
Header:
Unsere Partei möchte Vorreiter*in für Gleichstellung sein!

Subheader:
Bündnis 90/Die Grünen ist die erste Partei in Deutschland mit verbindlicher Frauenquote.

Body:
Seit 1986 regelt das grüne Frauenstatut: Mindestens 50 % aller Ämter und Mandate für Frauen! Platz 1 auf Listen ist immer für eine Frau reserviert für echte Gleichstellung in der Politik.

Info 2:
Header:
Gleichberechtigung ist unser Auftrag für die Zukunft.

Subheader:
Frauen verdienen noch immer 18% weniger als Männer bei gleicher Arbeit in Deutschland.

Body:
Wir fordern gleiche Bezahlung für gleiche Arbeit, bessere Vereinbarkeit von Familie und Beruf sowie mehr Frauen in Führungspositionen. Gleichstellung ist kein Privileg, sondern ein Grundrecht.

Suchbegriff: Gleichberechtigung, Frauen
</output>
</example>
</examples>

<task>
${thema && details 
  ? `Erstelle nun fünf verschiedene Info-Inhalte basierend auf folgendem Input:
<input>
Thema: ${thema}
Details: ${details}
</input>`
  : `Erstelle Info-Inhalte basierend auf diesem Thema: ${thema || 'Umweltschutz'}`}
</task>
`;

      builder.setRequest(baseXmlPrompt);
      const promptResult = builder.build();

      aiRequest = {
        type: 'info',
        usePrivacyMode: usePrivacyMode || false,
        systemPrompt: promptResult.system,
        messages: promptResult.messages,
        options: {
          max_tokens: 3000,
          temperature: 0.7,
          ...(usePrivacyMode && provider && { provider: provider })
        }
      };
    }

    console.log(`${logPrefix} Sending request to Claude API with prompt:`, aiRequest.messages[0].content.substring(0, 200) + '...');
    
    if (!req.app.locals.aiWorkerPool) {
      throw new Error('AI Worker Pool nicht initialisiert');
    }

    const aiResponse = await req.app.locals.aiWorkerPool.processRequest(aiRequest);

    console.log(`${logPrefix} Received response from Claude API:`, aiResponse);

    if (!aiResponse || !aiResponse.success) {
      throw new Error(aiResponse?.error || 'Keine gültige Antwort von der AI erhalten');
    }

    const textContent = aiResponse.content;
    console.log(`${logPrefix} Processed text content:`, textContent);

    // Type-specific response processing
    let response;
    
    if (type === 'dreizeilen' || type === 'headline') {
      // Process dreizeilen/headline response - extract slogans and search terms
      const lines = textContent.split('\n')
        .map(line => line.trim())
        .filter(line => line !== '');

      const slogans = [];
      let currentSlogan = {};
      let lineCount = 0;

      for (const line of lines) {
        if (line.startsWith('Slogan') || line.startsWith('Headline')) {
          if (lineCount > 0) {
            slogans.push({ ...currentSlogan });
          }
          currentSlogan = {};
          lineCount = 0;
          continue;
        }

        if (line.startsWith('Suchbegriff:')) {
          if (lineCount > 0) {
            slogans.push({ ...currentSlogan });
          }
          break;
        }

        if (line && !line.startsWith('Slogan') && !line.startsWith('Headline') && lineCount < 3) {
          const lineKey = `line${lineCount + 1}`;
          currentSlogan[lineKey] = line;
          lineCount++;
        }
      }

      const searchTermsLine = lines.find(line => line.startsWith('Suchbegriff:'));
      const searchTerms = searchTermsLine 
        ? searchTermsLine.replace('Suchbegriff:', '').split(',').map(term => term.trim())
        : [];

      response = {
        mainSlogan: slogans[0] || { line1: '', line2: '', line3: '' },
        alternatives: slogans.slice(1),
        searchTerms
      };
    } else if (type === 'zitat' || type === 'zitat_pure') {
      // Process zitat response - extract quotes from JSON
      let quotes = [];
      try {
        // Extract JSON from response
        const jsonMatch = textContent.match(/\[.*\]/s);
        if (jsonMatch) {
          // Clean JSON by removing JavaScript-style comments
          const cleanJson = jsonMatch[0].replace(/\/\/[^\n\r]*/g, '');
          quotes = JSON.parse(cleanJson);
        } else {
          // Fallback: Extract individual quotes
          quotes = textContent
            .split(/\d+\./)
            .map(q => q.trim())
            .filter(q => q)
            .map(q => ({
              quote: q.replace(/^.*?["„]|[""]$/g, '').trim()
            }));
        }
      } catch (error) {
        console.error(`${logPrefix} Error parsing quotes:`, error);
        // Fallback: Use first found quote
        const extractedQuote = textContent
          .replace(/^.*?["„]|[""]$/g, '')
          .replace(/^(Hier ist ein (mögliches )?Zitat|Ein Zitat).*?:/i, '')
          .trim();
        quotes = [{ quote: extractedQuote }];
      }
      
      // Ensure max 4 quotes
      quotes = quotes.slice(0, 4);
      
      response = {
        alternatives: quotes,
        quote: quotes[0]?.quote || ''
      };
    } else if (type === 'info') {
      // Process info response - extract structured info content (Header + Subheader + Body)
      const lines = textContent.split('\n')
        .map(line => line.trim())
        .filter(line => line !== '');

      const infoItems = [];
      let currentInfo = {};
      let currentSection = '';
      let headerLines = [];
      let subheaderLines = [];
      let bodyLines = [];

      for (const line of lines) {
        if (line.startsWith('Info')) {
          if (headerLines.length > 0 || subheaderLines.length > 0 || bodyLines.length > 0) {
            currentInfo.header = headerLines.join(' ');
            currentInfo.subheader = subheaderLines.join(' ');
            currentInfo.body = bodyLines.join(' ');
            infoItems.push({ ...currentInfo });
          }
          currentInfo = {};
          currentSection = '';
          headerLines = [];
          subheaderLines = [];
          bodyLines = [];
          continue;
        }

        if (line.startsWith('Header:')) {
          currentSection = 'header';
          continue;
        }

        if (line.startsWith('Subheader:')) {
          currentSection = 'subheader';
          continue;
        }

        if (line.startsWith('Body:')) {
          currentSection = 'body';
          continue;
        }

        if (line.startsWith('Suchbegriff:')) {
          if (headerLines.length > 0 || subheaderLines.length > 0 || bodyLines.length > 0) {
            currentInfo.header = headerLines.join(' ');
            currentInfo.subheader = subheaderLines.join(' ');
            currentInfo.body = bodyLines.join(' ');
            infoItems.push({ ...currentInfo });
          }
          break;
        }

        if (currentSection === 'header' && line && !line.startsWith('Info')) {
          headerLines.push(line);
        } else if (currentSection === 'subheader' && line && !line.startsWith('Info')) {
          subheaderLines.push(line);
        } else if (currentSection === 'body' && line && !line.startsWith('Info')) {
          bodyLines.push(line);
        }
      }

      // Handle any remaining content that wasn't saved
      if (headerLines.length > 0 || subheaderLines.length > 0 || bodyLines.length > 0) {
        currentInfo.header = headerLines.join(' ');
        currentInfo.subheader = subheaderLines.join(' ');
        currentInfo.body = bodyLines.join(' ');
        infoItems.push({ ...currentInfo });
      }

      const searchTermsLine = lines.find(line => line.startsWith('Suchbegriff:'));
      const searchTerms = searchTermsLine 
        ? searchTermsLine.replace('Suchbegriff:', '').split(',').map(term => term.trim())
        : [];

      response = {
        mainInfo: infoItems[0] || { header: '', subheader: '', body: '' },
        alternatives: infoItems.slice(1),
        searchTerms
      };
    }

    console.log(`${logPrefix} Sending response:`, response);
    res.json(response);
  } catch (error) {
    console.error(`${logPrefix} Error:`, error.message);
    const errorMessage = {
      'dreizeilen': 'Fehler bei der Dreizeilen-Generierung',
      'zitat': 'Fehler bei der Zitat-Generierung',
      'zitat_pure': 'Fehler bei der Zitat-Pure-Generierung',
      'headline': 'Fehler bei der Headline-Generierung',
      'info': 'Fehler bei der Info-Generierung'
    }[type] || 'Fehler bei der Generierung';
    
    if (type === 'dreizeilen' || type === 'headline' || type === 'info') {
      res.status(500).json({
        success: false,
        error: error.message || errorMessage
      });
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
};

// Route handlers for all types
router.post('/', async (req, res) => {
  await handleClaudeRequest(req, res, 'dreizeilen');
});

// Export both the router and the handler for external use
module.exports = router;
module.exports.handleClaudeRequest = handleClaudeRequest;