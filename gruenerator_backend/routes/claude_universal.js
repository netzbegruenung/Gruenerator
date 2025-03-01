const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { textForm, sprache, thema, details, useBackupProvider, customPrompt } = req.body;

  // Wenn ein benutzerdefinierter Prompt vorhanden ist, sind die anderen Felder optional
  if (!customPrompt && (!textForm || !sprache || !thema)) {
    return res.status(400).json({ 
      error: 'Alle Pflichtfelder (Textform, Sprache, Thema) müssen ausgefüllt sein oder ein benutzerdefinierter Prompt muss angegeben werden.' 
    });
  }

  try {
    // Systemanweisung für die Texterstellung
    const systemPrompt = `Du bist ein erfahrener politischer Texter für Bündnis 90/Die Grünen mit Expertise in verschiedenen Textformen.
Deine Hauptaufgabe ist es, politische Texte zu erstellen, die die grünen Werte und Ziele optimal kommunizieren.
Achte besonders auf:
- Klare politische Positionierung im Sinne der Grünen
- Zielgruppengerechte Ansprache
- Aktuelle politische Themen und deren Einordnung
- Lokale und regionale Bezüge, wo sinnvoll
- Handlungsaufforderungen und Lösungsvorschläge`;

    // Erstelle den Benutzerinhalt basierend auf dem Vorhandensein eines benutzerdefinierten Prompts
    let userContent;
    
    if (customPrompt) {
      // Bei benutzerdefiniertem Prompt diesen verwenden, aber mit Standardinformationen ergänzen
      userContent = `Benutzerdefinierter Prompt: ${customPrompt}

Zusätzliche Informationen (falls relevant):
${textForm ? `- Textform: ${textForm}` : ''}
${sprache ? `- Stil/Sprache: ${sprache}` : ''}
${thema ? `- Thema: ${thema}` : ''}
${details ? `- Details: ${details}` : ''}`;
    } else {
      // Standardinhalt ohne benutzerdefinierten Prompt
      userContent = `Erstelle einen Text mit folgenden Anforderungen:

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

Passe Struktur, Länge und Aufbau an die gewählte Textform an. Der Text soll im angegebenen Stil verfasst sein und dabei authentisch und überzeugend wirken.`;
    }

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'universal_generator',
      systemPrompt,
      messages: [
        {
          role: "user",
          content: userContent
        }
      ],
      options: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.9
      },
      useBackupProvider
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    res.json({ 
      content: result.content.trim(),
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Fehler bei der Texterstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung des Textes',
      details: error.message 
    });
  }
});

module.exports = router; 