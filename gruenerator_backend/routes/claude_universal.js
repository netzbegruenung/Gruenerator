const express = require('express');
// Import unified prompt building architecture
const {
  MARKDOWN_FORMATTING_INSTRUCTIONS,
  formatUserContent,
  TITLE_GENERATION_INSTRUCTION,
  processResponseWithTitle,
  PromptBuilder
} = require('../utils/promptBuilderCompat');

// Import attachment utilities
const {
  processAndBuildAttachments
} = require('../utils/attachmentUtils');

// Import response and error handling utilities
const { sendSuccessResponseWithAttachments, sendSuccessResponse } = require('../utils/responseFormatter');
const { withErrorHandler, handleValidationError } = require('../utils/errorHandler');

// Router for Universal Text Generation
const universalRouter = express.Router();

const universalHandler = withErrorHandler(async (req, res) => {
  const { textForm, sprache, thema, details, customPrompt, useWebSearchTool, usePrivacyMode, provider, attachments } = req.body;

  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  // Validate required fields
  if (!customPrompt && (!textForm || !sprache || !thema)) {
    return handleValidationError(
      res, 
      '/claude_universal',
      'Alle Pflichtfelder (Textform, Sprache, Thema) müssen ausgefüllt sein oder ein benutzerdefinierter Prompt muss angegeben werden.'
    );
  }

  // Process attachments using consolidated utility
  const attachmentResult = await processAndBuildAttachments(
    attachments, 
    usePrivacyMode, 
    'claude_universal', 
    req.user?.id || 'unknown'
  );

  // Handle attachment errors
  if (attachmentResult.error) {
    return handleValidationError(res, '/claude_universal', attachmentResult.error);
  }

  console.log('[claude_universal] Request received:', {
    textForm,
    sprache, 
    thema,
    hasCustomPrompt: !!customPrompt,
    useWebSearchTool: useWebSearchTool || false,
    usePrivacyMode: usePrivacyMode || false,
    provider: usePrivacyMode && provider ? provider : 'default',
    hasAttachments: attachmentResult.hasAttachments,
    attachmentsCount: attachmentResult.summary?.count || 0,
    attachmentsTotalSizeMB: attachmentResult.summary?.totalSizeMB || 0
  });
    console.log('[claude_universal] Starting AI Worker request');

    // Build prompt using new Context-First Architecture
    console.log('[claude_universal] Building prompt with new Context-First Architecture');
    
    const builder = new PromptBuilder('universal')
      .enableDebug(process.env.NODE_ENV === 'development');

    // Set system role for universal text generation
    const systemRole = `Du bist ein erfahrener politischer Texter für Bündnis 90/Die Grünen mit Expertise in verschiedenen Textformen.
Deine Hauptaufgabe ist es, politische Texte zu erstellen, die die grünen Werte und Ziele optimal kommunizieren.
Achte besonders auf:
- Klare politische Positionierung im Sinne der Grünen
- Zielgruppengerechte Ansprache
- Aktuelle politische Themen und deren Einordnung
- Lokale und regionale Bezüge, wo sinnvoll
- Handlungsaufforderungen und Lösungsvorschläge

Passe Struktur, Länge und Aufbau an die gewählte Textform an. Der Text soll im angegebenen Stil verfasst sein und dabei authentisch und überzeugend wirken.`;
    
    builder
      .setSystemRole(systemRole)
      .setFormatting(MARKDOWN_FORMATTING_INSTRUCTIONS);
      
    // Note: Universal text generation doesn't use platform constraints (flexible lengths)

    // Enable web search if requested
    if (useWebSearchTool) {
      const searchQuery = `${thema} ${details || ''} Bündnis 90 Die Grünen Politik`;
      console.log(`[claude_universal] 🔍 Web search enabled for: "${searchQuery}"`);
      await builder.handleWebSearch(searchQuery, 'content');
    }

    // Add documents if present
    if (attachmentResult.documents.length > 0) {
      await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
    }

    // Add custom instructions if present
    if (customPrompt) {
      builder.setInstructions(customPrompt);
    }

    // Build the request content
    let requestContent;
    
    if (customPrompt) {
      // For custom prompts, provide structured data
      requestContent = {
        textForm: textForm || 'Nicht angegeben',
        sprache: sprache || 'Nicht angegeben', 
        thema: thema || 'Nicht angegeben',
        details: details || '',
        currentDate
      };
    } else {
      // For standard requests, build descriptive content
      requestContent = `Erstelle einen Text mit folgenden Anforderungen:

<textform>
${textForm}
</textform>

<stil>
${sprache}
</stil>

<thema>
${thema}
</thema>

${details ? `<details>
${details}
</details>` : ''}

Aktuelles Datum: ${currentDate}

${TITLE_GENERATION_INSTRUCTION}`;
    }

    builder.setRequest(requestContent);

    // Build the final prompt
    const promptResult = builder.build();
    const systemPrompt = promptResult.system;
    const messages = promptResult.messages;
    const tools = promptResult.tools;
    
    // Extract web search sources for frontend display (separate from Claude prompt)
    const webSearchSources = builder.getWebSearchSources();

    const payload = {
      systemPrompt,
      messages,
      tools,
      options: {
        max_tokens: 4000,
        temperature: 0.9,
        ...(usePrivacyMode && provider && { provider: provider })
      },
      metadata: {
        webSearchSources: webSearchSources.length > 0 ? webSearchSources : null
      }
    };

    // Log web search status
    if (useWebSearchTool) {
      if (tools.length > 0) {
        console.log(`[claude_universal] 🔍 Web search ENABLED - Tool: ${tools[0].name}`);
      } else {
        console.log(`[claude_universal] 🔍 Web search results pre-fetched and added to context`);
      }
    }
    
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'universal_generator',
      usePrivacyMode: usePrivacyMode || false,
      ...payload
    }, req);

    console.log('[claude_universal] AI Worker response received:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error
    });

    if (!result.success) {
      console.error('[claude_universal] AI Worker error:', result.error);
      throw new Error(result.error);
    }

    // Send standardized success response
    sendSuccessResponseWithAttachments(
      res,
      result,
      '/claude_universal',
      { textForm, sprache, thema, details },
      attachmentResult,
      usePrivacyMode,
      provider
    );
}, '/claude_universal');

universalRouter.post('/', universalHandler);

// Router for Speech Generation (Rede)
const redeRouter = express.Router();

const redeHandler = withErrorHandler(async (req, res) => {
  const { rolle, thema, Zielgruppe, schwerpunkte, redezeit, customPrompt } = req.body;

  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  console.log('[claude_rede] Request received:', {
    rolle: rolle?.substring(0, 50) + (rolle?.length > 50 ? '...' : ''),
    thema: thema?.substring(0, 50) + (thema?.length > 50 ? '...' : ''),
    hasCustomPrompt: !!customPrompt,
    redezeit: redezeit || 'Nicht angegeben'
  });
    console.log('[claude_rede] Starting AI Worker request');

    // Build prompt using new Context-First Architecture
    console.log('[claude_rede] Building prompt with new Context-First Architecture');
    
    const builder = new PromptBuilder('rede')
      .enableDebug(process.env.NODE_ENV === 'development');

    // Set system role for speech generation
    const systemRole = `Sie sind damit beauftragt, eine politische Rede für ein Mitglied von Bündnis 90/Die Grünen zu schreiben. Ihr Ziel ist es, eine überzeugende und mitreißende Rede zu erstellen, die den Werten und Positionen der Partei entspricht und das gegebene Thema behandelt.

Geben Sie vor der rede an: 1. 2-3 Unterschiedliche Ideen für den Einstieg, dann 2-3 Kernargumente, dann 2-3 gute Ideen für ein Ende. Gib dem Redner 2-3 Tipps, worauf er bei dieser rede und diesem thema achten muss, um zu überzeugen.
Schreibe anschließend eine Rede.

Befolgen Sie diese Richtlinien, um die Rede zu verfassen:

1. Struktur:
 - Beginnen Sie mit einem starken Einstieg, der die Aufmerksamkeit auf sich zieht und das Thema vorstellt.
 - Verwenden Sie Übergänge zwischen den Abschnitten, um den Fluss aufrechtzuerhalten.
 - Schließen Sie mit einem kraftvollen Aufruf zum Handeln.

2. Parteilinie:
 - Integrieren Sie die Kernwerte von Bündnis 90/Die Grünen, wie Umweltschutz, soziale Gerechtigkeit und nachhaltige Entwicklung.
 - Beziehen Sie sich auf die aktuellen Positionen der Partei zu relevanten Themen.

3. Ton und Sprache:
 - Verwenden Sie klare, zugängliche, bodenständige, Sprache, die bei einem vielfältigen Publikum Anklang findet.
 - Finden Sie eine Balance zwischen Leidenschaft und Professionalität.
 - Setzen Sie rhetorische Mittel wie Wiederholungen, Metaphern oder rhetorische Fragen ein, um die Überzeugungskraft zu erhöhen.
 - Gehen Sie respektvoll, aber bestimmt auf mögliche Gegenargumente ein.

5. Abschluss:
 - Enden Sie mit einer starken, inspirierenden Botschaft, die die Hauptpunkte verstärkt und das Publikum motiviert, die Position des redners zu unterstützen oder Maßnahmen zu ergreifen.`;

    builder
      .setSystemRole(systemRole)
      .setFormatting(MARKDOWN_FORMATTING_INSTRUCTIONS);
      
    // Note: Speech generation doesn't use platform constraints (flexible lengths)

    // Add custom instructions if present
    if (customPrompt) {
      builder.setInstructions(customPrompt);
    }

    // Build the request content
    let requestContent;
    
    if (customPrompt) {
      // For custom prompts, provide structured data
      requestContent = {
        rolle: rolle || 'Nicht angegeben',
        thema: thema || 'Nicht angegeben',
        Zielgruppe: Zielgruppe || 'Nicht angegeben',
        schwerpunkte: schwerpunkte || 'Nicht angegeben',
        redezeit: redezeit || 'Nicht angegeben',
        currentDate
      };
    } else {
      // For standard requests, build descriptive content
      requestContent = `Erstelle eine überzeugende politische Rede für Bündnis 90/Die Grünen gemäß den gegebenen Parametern:

Rolle/Position des Redners: ${rolle}
Spezifisches Thema oder Anlass der Rede: ${thema}
Zielgruppe: ${Zielgruppe}
Besondere Schwerpunkte oder lokale Aspekte: ${schwerpunkte}
Gewünschte Redezeit (in Minuten): ${redezeit}
Aktuelles Datum: ${currentDate}

${TITLE_GENERATION_INSTRUCTION}`;
    }

    builder.setRequest(requestContent);

    // Build the final prompt
    const promptResult = builder.build();
    const systemPrompt = promptResult.system;
    const messages = promptResult.messages;

    const payload = {
      systemPrompt,
      messages,
      options: {
        max_tokens: 4000,
        temperature: 0.3
      }
    };
    
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'rede',
      usePrivacyMode: usePrivacyMode || false,
      ...payload
    }, req);

    console.log('[claude_rede] AI Worker response received:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error
    });

    if (!result.success) {
      console.error('[claude_rede] AI Worker error:', result.error);
      throw new Error(result.error);
    }
    
    // Send standardized success response
    sendSuccessResponse(
      res,
      result,
      '/claude_rede',
      { rolle, thema, Zielgruppe, schwerpunkte, redezeit }
    );
}, '/claude_rede');

redeRouter.post('/', redeHandler);

// Router for Election Program Generation (Wahlprogramm)
const wahlprogrammRouter = express.Router();

const wahlprogrammHandler = withErrorHandler(async (req, res) => {
  const { thema, details, zeichenanzahl, customPrompt } = req.body;

  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  console.log('[claude_wahlprogramm] Request received:', {
    thema: thema?.substring(0, 50) + (thema?.length > 50 ? '...' : ''),
    hasDetails: !!details,
    zeichenanzahl: zeichenanzahl || 'Nicht angegeben',
    hasCustomPrompt: !!customPrompt
  });
    console.log('[claude_wahlprogramm] Starting AI Worker request');

    // Build prompt using new Context-First Architecture
    console.log('[claude_wahlprogramm] Building prompt with new Context-First Architecture');
    
    const builder = new PromptBuilder('wahlprogramm')
      .enableDebug(process.env.NODE_ENV === 'development');

    // Set system role for election program generation
    const systemRole = `Du bist Schreiber des Wahlprogramms einer Gliederung von Bündnis 90/Die Grünen.

Beachte dabei folgende Punkte:

1. Beginne mit einer kurzen Einleitung (2-3 Sätze), die die Bedeutung des Themas hervorhebt.
2. Gliedere den Text in 3-4 Unterkapitel mit jeweils aussagekräftigen Überschriften.
3. Jedes Unterkapitel sollte 2-3 Absätze umfassen und mindestens eine konkrete politische Forderung oder einen Lösungsvorschlag enthalten.
4. Verwende eine klare, direkte Sprache ohne Fachbegriffe. Nutze das "Wir" und aktive Formulierungen wie "Wir wollen..." oder "Wir setzen uns ein für...".
5. Kritisiere bestehende Missstände, bleibe aber insgesamt optimistisch und lösungsorientiert.

Beachte zusätzlich diese sprachlichen Aspekte:
- Zukunftsorientierte und inklusive Sprache
- Betonung von Dringlichkeit
- Positive Verstärkung
- Verbindende Elemente
- Konkrete Beispiele
- Starke Verben
- Abwechslungsreicher Satzbau`;

    builder
      .setSystemRole(systemRole)
      .setFormatting(MARKDOWN_FORMATTING_INSTRUCTIONS);
      
    // Add length constraint if specified
    if (zeichenanzahl && !isNaN(parseInt(zeichenanzahl))) {
      const lengthConstraint = `LÄNGENANFORDERUNG: Das Kapitel soll etwa ${zeichenanzahl} Zeichen umfassen.`;
      builder.setConstraints(lengthConstraint);
    }

    // Add custom instructions if present
    if (customPrompt) {
      builder.setInstructions(customPrompt);
    }

    // Build the request content
    let requestContent;
    
    if (customPrompt) {
      // For custom prompts, provide structured data
      requestContent = {
        thema: thema || 'Nicht angegeben',
        details: details || '',
        zeichenanzahl: zeichenanzahl || 'Nicht angegeben',
        currentDate
      };
    } else {
      // For standard requests, build descriptive content
      requestContent = `Erstelle ein Kapitel für ein Wahlprogramm zum Thema ${thema} im Stil des vorliegenden Dokuments.

Aktuelles Datum: ${currentDate}

Berücksichtige dabei folgende Details und Schwerpunkte:
${details}

${zeichenanzahl ? `Das Kapitel soll etwa ${zeichenanzahl} Zeichen umfassen.` : ''}

${TITLE_GENERATION_INSTRUCTION}`;
    }

    builder.setRequest(requestContent);

    // Build the final prompt
    const promptResult = builder.build();
    const systemPrompt = promptResult.system;
    const messages = promptResult.messages;

    const payload = {
      systemPrompt,
      messages,
      options: {
        max_tokens: 4000,
        temperature: 0.3
      }
    };
    
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'wahlprogramm',
      usePrivacyMode: usePrivacyMode || false,
      ...payload
    }, req);

    console.log('[claude_wahlprogramm] AI Worker response received:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error
    });

    if (!result.success) {
      console.error('[claude_wahlprogramm] AI Worker error:', result.error);
      throw new Error(result.error);
    }
    
    // Send standardized success response
    sendSuccessResponse(
      res,
      result,
      '/claude_wahlprogramm',
      { thema, details, zeichenanzahl }
    );
}, '/claude_wahlprogramm');

wahlprogrammRouter.post('/', wahlprogrammHandler);

// Router for Bürgeranfragen (Citizen Inquiries) Generation
const buergeranfragenRouter = express.Router();

const buergeranfragenHandler = withErrorHandler(async (req, res) => {
  const { gremium, anfrage, antwortart, kontext, customPrompt, useWebSearchTool, usePrivacyMode, provider, attachments } = req.body;

  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  // Validate required fields
  if (!customPrompt && (!gremium || !anfrage || !antwortart)) {
    return handleValidationError(
      res, 
      '/claude_buergeranfragen',
      'Alle Pflichtfelder (Gremium, Anfrage, Antwortart) müssen ausgefüllt sein oder ein benutzerdefinierter Prompt muss angegeben werden.'
    );
  }

  // Process attachments using consolidated utility
  const attachmentResult = await processAndBuildAttachments(
    attachments, 
    usePrivacyMode, 
    'claude_buergeranfragen', 
    req.user?.id || 'unknown'
  );

  // Handle attachment errors
  if (attachmentResult.error) {
    return handleValidationError(res, '/claude_buergeranfragen', attachmentResult.error);
  }

  console.log('[claude_buergeranfragen] Request received:', {
    gremium,
    anfrage: anfrage?.substring(0, 100) + (anfrage?.length > 100 ? '...' : ''),
    antwortart,
    hasKontext: !!kontext,
    hasCustomPrompt: !!customPrompt,
    useWebSearchTool: useWebSearchTool || false,
    usePrivacyMode: usePrivacyMode || false,
    provider: usePrivacyMode && provider ? provider : 'default',
    hasAttachments: attachmentResult.hasAttachments,
    attachmentsCount: attachmentResult.summary?.count || 0,
    attachmentsTotalSizeMB: attachmentResult.summary?.totalSizeMB || 0
  });
    console.log('[claude_buergeranfragen] Starting AI Worker request');

    // Build prompt using new Context-First Architecture
    console.log('[claude_buergeranfragen] Building prompt with new Context-First Architecture');
    
    const builder = new PromptBuilder('buergeranfragen')
      .enableDebug(process.env.NODE_ENV === 'development');

    // Set system role for citizen inquiries generation
    const systemRole = `Du bist ein erfahrener politischer Berater und Kommunikationsexperte für Bündnis 90/Die Grünen mit spezieller Expertise im Umgang mit Bürger*innenanfragen.

Deine Hauptaufgabe ist es, professionelle, sachkundige und politisch fundierte Antworten auf Anfragen von Bürger*innen zu erstellen, die:

**Inhaltliche Qualität:**
- Sachlich korrekt und gut recherchiert sind
- Die grüne politische Position klar und verständlich darstellen
- Konkrete Handlungsvorschläge und Lösungsansätze bieten
- Aktuelle Gesetzeslage und politische Entwicklungen berücksichtigen

**Kommunikative Exzellenz:**
- Respektvoll und wertschätzend gegenüber der Anfrage sind
- Je nach gewählter Antwortart den passenden Ton treffen
- Bürgernah und verständlich formuliert sind
- Transparenz über politische Positionen und Grenzen schaffen

**Politische Positionierung:**
- Grüne Werte wie Nachhaltigkeit, soziale Gerechtigkeit und Demokratie betonen
- Konstruktive Kritik an bestehenden Missständen üben
- Lösungsorientierte Herangehensweise verfolgen
- Partizipation und Bürgerbeteiligung fördern

**Struktureller Aufbau:**
1. Freundliche Begrüßung und Dank für die Anfrage
2. Kurze Einordnung des Themas
3. Detaillierte Antwort mit grüner Perspektive
4. Konkrete nächste Schritte oder Handlungsempfehlungen
5. Angebot für weitere Gespräche/Informationen

Achte darauf, dass die Antwort dem gewählten Stil entspricht und dabei authentisch und überzeugend wirkt.`;
    
    builder
      .setSystemRole(systemRole)
      .setFormatting(MARKDOWN_FORMATTING_INSTRUCTIONS);
      
    // Note: Citizen inquiries don't use platform constraints (flexible lengths)

    // Enable web search if requested
    if (useWebSearchTool) {
      const searchQuery = `${anfrage} ${gremium} ${kontext || ''} Bündnis 90 Die Grünen Politik`;
      console.log(`[claude_buergeranfragen] 🔍 Web search enabled for: "${searchQuery}"`);
      await builder.handleWebSearch(searchQuery, 'content');
    }

    // Add documents if present
    if (attachmentResult.documents.length > 0) {
      await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
    }

    // Add custom instructions if present
    if (customPrompt) {
      builder.setInstructions(customPrompt);
    }

    // Build the request content
    let requestContent;
    
    if (customPrompt) {
      // For custom prompts, provide structured data
      requestContent = {
        gremium: gremium || 'Nicht angegeben',
        anfrage: anfrage || 'Nicht angegeben',
        antwortart: antwortart || 'Nicht angegeben',
        kontext: kontext || '',
        currentDate
      };
    } else {
      // For standard requests, build descriptive content using the provided template
      requestContent = `Du bist ein KI-Assistent, der für ein Büro von Die Grünen arbeitet. Deine Aufgabe ist es, Bürgeranfragen zu beantworten. Du sollst eine höfliche, informative und dem Parteiprogramm der Grünen entsprechende Antwort verfassen.

Hier sind die Details zur Anfrage:

Gremium:
<gremium>
${gremium}
</gremium>

Bürgeranfrage:
<anfrage>
${anfrage}
</anfrage>

Art der gewünschten Antwort:
<antwortart>
${antwortart}
</antwortart>

${kontext ? `Zusätzlicher Kontext:
<zusaetzlicher_kontext>
${kontext}
</zusaetzlicher_kontext>

` : ''}Beachte bei der Erstellung deiner Antwort folgende Richtlinien:
1. Bleibe immer höflich und respektvoll.
2. Beziehe dich auf die Werte und Positionen der Grünen.
3. Sei informativ und faktenbasiert, aber vermeide zu technische Sprache.
4. Zeige Verständnis für die Anliegen des Bürgers.
5. Biete, wenn möglich, konkrete Lösungsansätze oder Handlungsempfehlungen an.

Passe den Ton und Stil deiner Antwort entsprechend der gewünschten Antwortart an. Wenn beispielsweise eine formelle Antwort gewünscht ist, verwende eine sachliche und professionelle Sprache. Bei einer persönlicheren Antwort kannst du einen wärmeren, empathischeren Ton anschlagen.

Verfasse nun deine Antwort auf die Bürgeranfrage. Berücksichtige dabei das angegebene Gremium, die spezifische Anfrage und die gewünschte Art der Antwort.

Gib deine fertige Antwort in folgendem Format aus:

<antwort>
[Hier deine formulierte Antwort einfügen]
</antwort>

${TITLE_GENERATION_INSTRUCTION}`;
    }

    builder.setRequest(requestContent);

    // Build the final prompt
    const promptResult = builder.build();
    const systemPrompt = promptResult.system;
    const messages = promptResult.messages;
    const tools = promptResult.tools;
    
    // Extract web search sources for frontend display (separate from Claude prompt)
    const webSearchSources = builder.getWebSearchSources();

    const payload = {
      systemPrompt,
      messages,
      tools,
      options: {
        max_tokens: 4000,
        temperature: 0.7,
        ...(usePrivacyMode && provider && { provider: provider })
      },
      metadata: {
        webSearchSources: webSearchSources.length > 0 ? webSearchSources : null
      }
    };

    // Log web search status
    if (useWebSearchTool) {
      if (tools.length > 0) {
        console.log(`[claude_buergeranfragen] 🔍 Web search ENABLED - Tool: ${tools[0].name}`);
      } else {
        console.log(`[claude_buergeranfragen] 🔍 Web search results pre-fetched and added to context`);
      }
    }
    
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'buergeranfragen_generator',
      usePrivacyMode: usePrivacyMode || false,
      ...payload
    }, req);

    console.log('[claude_buergeranfragen] AI Worker response received:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error
    });

    if (!result.success) {
      console.error('[claude_buergeranfragen] AI Worker error:', result.error);
      throw new Error(result.error);
    }

    // Send standardized success response
    sendSuccessResponseWithAttachments(
      res,
      result,
      '/claude_buergeranfragen',
      { gremium, anfrage, antwortart, kontext },
      attachmentResult,
      usePrivacyMode,
      provider
    );
}, '/claude_buergeranfragen');

buergeranfragenRouter.post('/', buergeranfragenHandler);

module.exports = {
  universalRouter,
  redeRouter,
  wahlprogrammRouter,
  buergeranfragenRouter
}; 