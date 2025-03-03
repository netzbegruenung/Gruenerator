const express = require('express');
const router = express.Router();

const platformGuidelines = {
  instagram: {
    maxLength: 1000,
    style: "Radikal, aktivistisch und direkt.",
    focus: "Politische Bildung und Aktivismus.",
    additionalGuidelines: `
      - Gezielte Verwendung von Emojis (✊ für Aktivismus, ❗️ für wichtige Punkte)
      - Kurze, prägnante Absätze
      - Hashtags strategisch einsetzen (#GrueneJugend #Klimagerechtigkeit)
    `
  },
  twitter: {
    maxLength: 280,
    style: "Scharf, konfrontativ und pointiert.",
    focus: "Schnelle Reaktionen und Kritik.",
    additionalGuidelines: `
      - Maximal 1-2 Emojis pro Tweet
      - Mit Ironie und Sarkasmus arbeiten
      - Hashtags für Reichweite nutzen
      - Direkte Kritik an politischen Gegner*innen
    `
  },
  tiktok: {
    maxLength: 150,
    style: "Jung, rebellisch und authentisch.",
    focus: "Politische Bildung für junge Menschen.",
    additionalGuidelines: `
      - Komplexe Themen einfach erklären
      - Trends kreativ politisch nutzen
      - Humor einsetzen
      - Authentizität betonen
    `
  },
  messenger: {
    maxLength: 2000,
    style: "Informativ und mobilisierend.",
    focus: "Aktivismus-Koordination.",
    additionalGuidelines: `
      - Ausführliche politische Analysen
      - Konkrete Handlungsvorschläge
      - Infos zu Demos und Aktionen
      - Links zu Ressourcen
      - Emojis nur für wichtige Markierungen
    `
  },
  reelScript: {
    maxLength: 1000,
    style: "Aktivistisch und authentisch.",
    focus: "Video-Content für politische Bildung.",
    additionalGuidelines: `
      - 60 Sekunden Sprechzeit
      - Struktur:
        * Hook (10s): Provokante Frage/Statement
        * Hauptteil (40s): Politische Analyse
        * Call-to-Action (10s): Handlungsaufforderung
      - [Szenenanweisungen] für authentische Darstellung
    `
  },
  actionIdeas: {
    maxLength: 1000,
    style: "Konkret und aktivierend.",
    focus: "Direkte Aktionen und Protest.",
    additionalGuidelines: `
      - 2-3 konkrete Aktionsvorschläge
      - Kreative Protestformen
      - Materialanforderungen
      - Zeitaufwand
      - Rechtliche Hinweise
      - ✊ für Aktionsaufrufe
    `
  }
};

router.post('/', async (req, res) => {
  const { thema, details, platforms = [], useBackupProvider, customPrompt } = req.body;
  console.log('[claude_gruene_jugend] Anfrage erhalten:', { 
    thema, 
    details, 
    platforms,
    hasCustomPrompt: !!customPrompt
  });

  try {
    console.log('[claude_gruene_jugend] Starte AI Worker Request');

    // Systemanweisung für die GRÜNE JUGEND Inhalte
    const systemPrompt = `Du bist Social Media Manager für die GRÜNE JUGEND. 
      Erstelle Vorschläge für Social-Media-Beiträge im typischen Stil der GRÜNEN JUGEND.

      Allgemeine Richtlinien für alle Plattformen:
      - Klare linke politische Positionierung
      - Direkte, jugendliche Ansprache ("Leute", "ihr", "wir")
      - Klare Handlungsaufforderungen ("Kommt vorbei!", "Seid dabei!")
      - Solidarische Botschaften mit marginalisierten Gruppen
      - Fragen zur Interaktion stellen ("Bist du dabei?", "Was würdet ihr tun?")
      - Aufruf zu direktem Aktivismus

      Formatiere deine Antwort als Text mit Überschriften für die verschiedenen Plattformen. 
      WICHTIG: Jede Plattform muss mit einem eigenen Header in Großbuchstaben und einem Doppelpunkt 
      beginnen, z.B. "TWITTER:" oder "INSTAGRAM:"`;

    // Erstelle den Benutzerinhalt basierend auf dem Vorhandensein eines benutzerdefinierten Prompts
    let userContent;
    
    if (customPrompt) {
      // Bei benutzerdefiniertem Prompt diesen verwenden, aber mit Plattforminformationen ergänzen
      userContent = `
Benutzerdefinierter Prompt: ${customPrompt}

Erstelle Inhalte für folgende Plattformen: ${platforms.join(', ')}

${platforms.map(platform => {
  const guidelines = platformGuidelines[platform];
  return `${platform.toUpperCase()}: Maximale Länge: ${guidelines.maxLength} Zeichen. Stil: ${guidelines.style} Fokus: ${guidelines.focus}`;
}).join('\n')}`;
    } else {
      // Standardinhalt ohne benutzerdefinierten Prompt
      userContent = `
Thema: ${thema}
Details: ${details}
Plattformen: ${platforms.join(', ')}
        
Erstelle einen maßgeschneiderten Social-Media-Beitrag für jede ausgewählte Plattform zu diesem Thema im charakteristischen Stil der GRÜNEN JUGEND. Berücksichtige diese plattformspezifischen Richtlinien:

${platforms.map(platform => {
  const guidelines = platformGuidelines[platform];
  return `${platform.toUpperCase()}: Maximale Länge: ${guidelines.maxLength} Zeichen. Stil: ${guidelines.style} Fokus: ${guidelines.focus} Zusätzliche Richtlinien: ${guidelines.additionalGuidelines}`;
}).join('\n')}

Jeder Beitrag sollte:
1. Eine klare linke, aktivistische Perspektive zeigen
2. Direkte Kritik an Missständen üben
3. Konkrete Handlungsaufforderungen enthalten
4. Solidarität mit marginalisierten Gruppen ausdrücken
5. Emojis effektiv zur Betonung wichtiger Punkte einsetzen
6. Hashtags strategisch verwenden
7. Eine jugendliche, authentische Sprache nutzen
8. Zum direkten politischen Handeln aufrufen`;
    }

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'gruene_jugend',
      systemPrompt,
      messages: [{
        role: 'user',
        content: userContent
      }],
      options: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 8000,
        temperature: 0.9
      },
      useBackupProvider
    });

    console.log('[claude_gruene_jugend] AI Worker Antwort erhalten:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error
    });

    if (!result.success) {
      console.error('[claude_gruene_jugend] AI Worker Fehler:', result.error);
      throw new Error(result.error);
    }

    const response = { 
      content: result.content,
      metadata: result.metadata
    };
    console.log('[claude_gruene_jugend] Sende erfolgreiche Antwort:', {
      contentLength: response.content?.length,
      hasMetadata: !!response.metadata
    });
    res.json(response);
  } catch (error) {
    console.error('[claude_gruene_jugend] Fehler bei der Social Media Post Erstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung der Social Media Posts',
      details: error.message 
    });
  }
});

module.exports = router; 