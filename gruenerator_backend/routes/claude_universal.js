const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { textForm, sprache, thema, details, useBackupProvider } = req.body;

  if (!textForm || !sprache || !thema) {
    return res.status(400).json({ 
      error: 'Alle Pflichtfelder (Textform, Sprache, Thema) müssen ausgefüllt sein.' 
    });
  }

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'universal_generator',
      systemPrompt: `Du bist ein erfahrener politischer Texter für Bündnis 90/Die Grünen mit Expertise in verschiedenen Textformen.
Deine Hauptaufgabe ist es, politische Texte zu erstellen, die die grünen Werte und Ziele optimal kommunizieren.
Achte besonders auf:
- Klare politische Positionierung im Sinne der Grünen
- Zielgruppengerechte Ansprache
- Aktuelle politische Themen und deren Einordnung
- Lokale und regionale Bezüge, wo sinnvoll
- Handlungsaufforderungen und Lösungsvorschläge`,
      messages: [
        {
          role: "user",
          content: `Erstelle einen Text mit folgenden Anforderungen:

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

Passe Struktur, Länge und Aufbau an die gewählte Textform an. Der Text soll im angegebenen Stil verfasst sein und dabei authentisch und überzeugend wirken.`
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