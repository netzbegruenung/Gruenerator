const express = require('express');
const router = express.Router();

const platformGuidelines = {
  facebook: {
    maxLength: 600,
    style: "Casual and conversational. Use emojis sparingly.",
    focus: "Community engagement, longer-form content, visual storytelling.",
    additionalGuidelines: `
      - Use a personal, direct tone ("you").
      - Friendly and relaxed style encouraging discussions.
      - Include visual elements to support the text.
      - Use emojis and hashtags sparingly.
      - End the post with a clear call to action.
    `
  },
  instagram: {
    maxLength: 600,
    style: "Visual, fun, and snappy. Heavy use of emojis and hashtags.",
    focus: "Visual appeal, lifestyle content, behind-the-scenes glimpses.",
    additionalGuidelines: `
      - Use plenty of emojis to visually emphasize emotions and messages.
      - Keep paragraphs short and scannable.
      - Share clear, engaging political messages that resonate emotionally.
      - Use hashtags strategically to increase reach.
      - End the post with a call to action or a question.
    `
  },
  twitter: {
    maxLength: 280,
    style: "Concise and witty. Use hashtags strategically.",
    focus: "Real-time updates, quick facts, calls-to-action.",
    additionalGuidelines: `
      - Use clear, direct language with no unnecessary elaboration.
      - Present clear political positions on current issues.
      - Use a direct tone to engage the reader.
      - Use hashtags strategically but avoid overuse .
      - Sparing use of emojis.
      - Start with a hook or clear statement.
      - End the post with a call to action or a question.
    `
  },
  linkedin: {
    maxLength: 600,
    style: "Professional yet approachable. Minimal use of emojis.",
    focus: "policy discussions, professional development.",
    additionalGuidelines: `
      - Maintain a professional but approachable tone.
      - Share insights and analyses on current topics or trends.
      - Highlight the connection between politics and professional growth.
      - Use emojis sparingly and limit excessive hashtag use.
      - End the post with a call to action or a question geared towards professional engagement.
    `
  },
  reelScript: {
    maxLength: 1000,
    style: "Einfach, authentisch und direkt",
    focus: "Klare Botschaft mit minimalen technischen Anforderungen.",
    additionalGuidelines: `
      - Skript für 90 Sekunden Sprechzeit
      - Maximal 2-3 einfache Schnitte/Szenen
      - [Szenenanweisungen] sollten mit Smartphone und ohne spezielle Ausrüstung umsetzbar sein
      - Struktur:
        * Einstieg/Hook (20s): Eine Szene, direkt in die Kamera sprechen
        * Hauptteil (50s): Optional 1-2 einfache Einblendungen von Bilderm, Videos, Fakten oder Zahlen
        * Abschluss (20s): Wieder direkt in die Kamera, Call-to-Action
      - Natürliche, authentische Sprache wie in einem persönlichen Gespräch
      - Text sollte auch ohne visuelle Elemente funktionieren
      - Einblendungen nur für wichtige Zahlen oder Kernbotschaften verwenden
    `
  },
  actionIdeas: {
    maxLength: 1000,
    style: "Konkret und umsetzbar",
    focus: "Praktische Aktionen für Ortsverbände",
    additionalGuidelines: `
      - 2-3 konkrete Aktionsideen
      - Mit wenig Budget umsetzbar
      - Aufmerksamkeit erregen
      - Zum Mitmachen einladen
      - Die grüne Botschaft transportieren
      - Klare Handlungsanweisungen
      - Materialanforderungen auflisten
      - Zeitaufwand einschätzen
    `
  }
};

router.post('/', async (req, res) => {
  const { thema, details, platforms = [], was, wie, zitatgeber, pressekontakt, useBackupProvider, customPrompt } = req.body;
  console.log('[claude_social] Anfrage erhalten:', { 
    thema, 
    details, 
    platforms,
    hasCustomPrompt: !!customPrompt
  });

  try {
    console.log('[claude_social] Starte AI Worker Request');

    let systemPrompt = 'Du bist Social Media Manager für Bündnis 90/Die Grünen. Erstelle Vorschläge für Social-Media-Beiträge für die angegebenen Plattformen und passe den Inhalt und Stil an jede Plattform an. Formatiere deine Antwort als Text mit Überschriften für die verschiedenen Plattformen. WICHTIG: Jede Plattform muss mit einem eigenen Header in Großbuchstaben und einem Doppelpunkt beginnen, z.B. "TWITTER:" oder "INSTAGRAM:".';

    // Wenn Pressemitteilung ausgewählt ist, füge den Pressemitteilungs-Prompt hinzu
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

Erstelle Inhalte für folgende Plattformen: ${platforms.join(', ')}

${platforms.map(platform => {
  if (platform === 'pressemitteilung') return '';
  const upperPlatform = platform === 'reelScript' ? 'INSTAGRAM REEL' : platform.toUpperCase();
  return `${upperPlatform}: Maximale Länge: ${platformGuidelines[platform].maxLength} Zeichen. Stil: ${platformGuidelines[platform].style} Fokus: ${platformGuidelines[platform].focus}`;
}).filter(Boolean).join('\n')}`;
    } else {
      // Standardinhalt ohne benutzerdefinierten Prompt
      userContent = `
        Thema: ${thema}
Details: ${details}
Plattformen: ${platforms.join(', ')}
${platforms.includes('pressemitteilung') ? `
Was: ${was}
Wie: ${wie}
Zitat von: ${zitatgeber}
Pressekontakt: ${pressekontakt}` : ''}
        
Erstelle einen maßgeschneiderten Social-Media-Beitrag für jede ausgewählte Plattform zu diesem Thema, der den Stil und die Werte von Bündnis 90/Die Grünen widerspiegelt. Berücksichtige diese plattformspezifischen Richtlinien:

${platforms.map(platform => {
  if (platform === 'pressemitteilung') return '';
  const upperPlatform = platform === 'reelScript' ? 'INSTAGRAM REEL' : platform.toUpperCase();
  return `${upperPlatform}: Maximale Länge: ${platformGuidelines[platform].maxLength} Zeichen. Stil: ${platformGuidelines[platform].style} Fokus: ${platformGuidelines[platform].focus} Zusätzliche Richtlinien: ${platformGuidelines[platform].additionalGuidelines}`;
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
        model: "claude-3-5-sonnet-20240620",
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