const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { name, position, ort, personenbeschreibung, themen } = req.body;

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'kandidat',
      systemPrompt: "Du bist ein Experte für politische Kommunikation von Bündnis 90/Die Grünen.",
      prompt: `Du bist ein Experte für politische Kommunikation und sollst eine Kandidat*innenseite für ${name} erstellen.
Die Person kandidiert als ${position} in ${ort}.

Hier sind die Informationen zur Person:
${personenbeschreibung}

Die wichtigsten politischen Themen sind:
${themen}

Bitte erstelle daraus eine JSON-Datei im folgenden Format. Achte auf einen persönlichen, authentischen Stil und formuliere die Texte so, dass sie die Person und ihre Ziele gut repräsentieren:

{
    "hero": {
        "heading": "Hi, ich bin [Name]",
        "text": "[Position und wichtigste Funktion]"
    },
    "about": {
        "title": "Über mich",
        "content": "[Ausführliche, persönliche Beschreibung]"
    },
    "hero_image": {
        "title": "[Kernbotschaft/Slogan]",
        "subtitle": "[Aufruf zum Mitmachen]"
    },
    "themes": [
        {
            "title": "[Thema 1]",
            "content": "[Beschreibung Thema 1]"
        },
        {
            "title": "[Thema 2]",
            "content": "[Beschreibung Thema 2]"
        },
        {
            "title": "[Thema 3]",
            "content": "[Beschreibung Thema 3]"
        }
    ],
    "actions": [
        {
            "text": "Unterstütze meine Kampagne",
            "link": "#spenden"
        },
        {
            "text": "Werde Mitglied",
            "link": "https://www.gruene.de/mitglied-werden"
        },
        {
            "text": "Komm ins Team",
            "link": "#kontakt"
        }
    ],
    "contact": {
        "title": "Lass uns ins Gespräch kommen!",
        "email": "vorname.nachname@gruene-[ort].de"
    }
}

Wichtig:
- Formuliere alles in der ersten Person
- Nutze geschlechtergerechte Sprache
- Verwende einen authentischen, persönlichen Stil
- Die E-Mail-Adresse sollte dem Schema vorname.nachname@gruene-[ort].de folgen
- Behalte die vorgegebenen Action-Links bei

Gib NUR die JSON-Datei zurück, ohne weitere Erklärungen.`,
      options: {
        max_tokens: 2000,
        temperature: 0.7
      }
    });

    if (!result.success) throw new Error(result.error);
    res.json({ content: result.content });
  } catch (error) {
    console.error('Fehler im Kandidatengenerator:', error);
    res.status(500).json({ 
      error: 'Fehler beim Generieren der Kandidat*innenseite',
      details: error.message 
    });
  }
});

module.exports = router; 