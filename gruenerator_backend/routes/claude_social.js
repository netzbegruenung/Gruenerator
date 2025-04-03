const express = require('express');
const router = express.Router();
// Importiere die ausgelagerten Konstanten
const {
  HTML_FORMATTING_INSTRUCTIONS,
  PLATFORM_SPECIFIC_GUIDELINES,
  PLATFORM_HEADER_STRUCTURE_INSTRUCTIONS
} = require('../utils/promptUtils');

router.post('/', async (req, res) => {
  const { thema, details, platforms = [], was, wie, zitatgeber, pressekontakt, useBackupProvider, customPrompt } = req.body;
  
  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];
  
  console.log('[claude_social] Anfrage erhalten:', { 
    thema, 
    details, 
    platforms,
    hasCustomPrompt: !!customPrompt
  });

  try {
    console.log('[claude_social] Starte AI Worker Request');

    let systemPrompt = `Du bist Social Media Manager für Bündnis 90/Die Grünen. Erstelle Vorschläge für Social-Media-Beiträge für die angegebenen Plattformen.

${PLATFORM_HEADER_STRUCTURE_INSTRUCTIONS}

${HTML_FORMATTING_INSTRUCTIONS}`;

    // Füge den spezifischen Pressemitteilungs-Prompt hinzu, falls benötigt
    if (platforms.includes('pressemitteilung')) {
      systemPrompt += `

Für die Pressemitteilung agiere als Pressesprecher einer Gliederung von Bündnis 90/Die Grünen und schreibe eine Pressemitteilung für den Presseverteiler.

Schreibe in folgendem Stil, Sprachstil und Tonfall:
- Der Text ist förmlich und sachlich und verwendet einen geradlinigen Berichtsstil.
- Es werden komplexe Sätze und eine Mischung aus zusammengesetzten und komplexen Satzstrukturen verwendet, was zu einem professionellen und informativen Ton beiträgt.
- Die Verwendung von spezifischen Begriffen und Namen verleiht dem Text einen autoritären Charakter.
- Der Text enthält auch direkte Zitate, die nahtlos eingefügt werden sollten, um den autoritativen und sachlichen Ton beizubehalten.

Achte bei der Umsetzung dieses Stils auf Klarheit, Präzision und eine ausgewogene Struktur deiner Sätze, um eine formale und objektive Darstellung der Informationen zu gewährleisten.`;
    }

    // Erstelle den Benutzerinhalt basierend auf dem Vorhandensein eines benutzerdefinierten Prompts
    let userContent;
    
    if (customPrompt) {
      // Bei benutzerdefiniertem Prompt diesen verwenden, aber mit Plattforminformationen ergänzen
      userContent = `
Benutzerdefinierter Prompt: ${customPrompt}

Aktuelles Datum: ${currentDate}

Erstelle Inhalte für folgende Plattformen: ${platforms.join(', ')}

${platforms.map(platform => {
  if (platform === 'pressemitteilung') return '';
  const upperPlatform = platform === 'reelScript' ? 'INSTAGRAM REEL' : platform.toUpperCase();
  const guidelines = PLATFORM_SPECIFIC_GUIDELINES[platform] || {};
  return `${upperPlatform}: Maximale Länge: ${guidelines.maxLength || 'N/A'} Zeichen. Stil: ${guidelines.style || 'N/A'} Fokus: ${guidelines.focus || 'N/A'}`;
}).filter(Boolean).join('\n')}`;
    } else {
      // Standardinhalt ohne benutzerdefinierten Prompt
      userContent = `
        Thema: ${thema}
Details: ${details}
Plattformen: ${platforms.join(', ')}
Aktuelles Datum: ${currentDate}
${platforms.includes('pressemitteilung') ? `
Was: ${was}
Wie: ${wie}
Zitat von: ${zitatgeber}
Pressekontakt: ${pressekontakt}` : ''}
        
Erstelle einen maßgeschneiderten Social-Media-Beitrag für jede ausgewählte Plattform zu diesem Thema, der den Stil und die Werte von Bündnis 90/Die Grünen widerspiegelt. Berücksichtige diese plattformspezifischen Richtlinien:

${platforms.map(platform => {
  if (platform === 'pressemitteilung') return '';
  const upperPlatform = platform === 'reelScript' ? 'INSTAGRAM REEL' : platform.toUpperCase();
  const guidelines = PLATFORM_SPECIFIC_GUIDELINES[platform] || {};
  return `${upperPlatform}: Maximale Länge: ${guidelines.maxLength || 'N/A'} Zeichen. Stil: ${guidelines.style || 'N/A'} Fokus: ${guidelines.focus || 'N/A'} Zusätzliche Richtlinien: ${guidelines.additionalGuidelines || ''}`;
}).filter(Boolean).join('\n')}

${platforms.includes('pressemitteilung') ? '' : `Jeder Beitrag sollte:
1. Ein eigener Beitragstext angepasst an die spezifische Plattform und deren Zielgruppe sein.
2. Mit einer aufmerksamkeitsstarken Einleitung beginnen.
3. Wichtige Botschaften klar und prägnant vermitteln.
4. Emojis und Hashtags passend zur Plattform verwenden.
5. Themen wie Klimaschutz, soziale Gerechtigkeit und Vielfalt betonen.
6. Aktuelle Positionen der Grünen Partei einbeziehen.
7. Bei Bedarf auf weiterführende Informationen verweisen (z.B. Webseite).`}`;
    }

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'social',
      systemPrompt,
      messages: [{
        role: 'user',
        content: userContent
      }],
      options: {
        max_tokens: 4000,
        temperature: 0.9
      },
      useBackupProvider
    });

    console.log('[claude_social] AI Worker Antwort erhalten:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error
    });

    if (!result.success) {
      console.error('[claude_social] AI Worker Fehler:', result.error);
      throw new Error(result.error);
    }

    const response = { 
      content: result.content,
      metadata: result.metadata
    };
    console.log('[claude_social] Sende erfolgreiche Antwort:', {
      contentLength: response.content?.length,
      hasMetadata: !!response.metadata
    });
    res.json(response);
  } catch (error) {
    console.error('[claude_social] Fehler bei der Social Media Post Erstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung der Social Media Posts',
      details: error.message 
    });
  }
});

module.exports = router;