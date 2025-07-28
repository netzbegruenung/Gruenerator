const express = require('express');
const {
  HTML_FORMATTING_INSTRUCTIONS,
  formatUserContent,
  TITLE_GENERATION_INSTRUCTION,
  processResponseWithTitle
} = require('../utils/promptUtils');

// Router for Universal Text Generation
const universalRouter = express.Router();

universalRouter.post('/', async (req, res) => {
  const { textForm, sprache, thema, details, customPrompt } = req.body;

  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  // Wenn ein benutzerdefinierter Prompt vorhanden ist, sind die anderen Felder optional
  if (!customPrompt && (!textForm || !sprache || !thema)) {
    return res.status(400).json({ 
      error: 'Alle Pflichtfelder (Textform, Sprache, Thema) müssen ausgefüllt sein oder ein benutzerdefinierter Prompt muss angegeben werden.' 
    });
  }

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
  
  // Build the specialized base content for universal text generation
  const baseContent = `Passe Struktur, Länge und Aufbau an die gewählte Textform an. Der Text soll im angegebenen Stil verfasst sein und dabei authentisch und überzeugend wirken.

${HTML_FORMATTING_INSTRUCTIONS}`;
  
  if (customPrompt) {
    const additionalInfo = `Zusätzliche Informationen (falls relevant):
${textForm ? `- Textform: ${textForm}` : ''}
${sprache ? `- Stil/Sprache: ${sprache}` : ''}
${thema ? `- Thema: ${thema}` : ''}
${details ? `- Details: ${details}` : ''}`;

    userContent = formatUserContent({
      customPrompt,
      baseContent,
      currentDate,
      additionalInfo
    });
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

Aktuelles Datum: ${currentDate}

${baseContent}`;
  }

  // Add title generation instruction to user content
  userContent += TITLE_GENERATION_INSTRUCTION;

  const payload = {
    systemPrompt,
    messages: [
      {
        role: "user",
        content: userContent
      }
    ],
    options: {
      max_tokens: 4000,
      temperature: 0.9
    },
    
  };
  
  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'universal_generator',
      ...payload
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    const processedResult = processResponseWithTitle(result, '/claude_universal', { textForm, sprache, thema, details });
    res.json({ 
      content: processedResult.content.trim(),
      metadata: processedResult.metadata
    });
  } catch (error) {
    console.error('Fehler bei der Texterstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung des Textes',
      details: error.message 
    });
  }
});

// Router for Speech Generation (Rede)
const redeRouter = express.Router();

redeRouter.post('/', async (req, res) => {
  const { rolle, thema, Zielgruppe, schwerpunkte, redezeit, customPrompt } = req.body;

  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  try {
    // Systemanweisung für die Redenerstellung
    const systemPrompt = `Sie sind damit beauftragt, eine politische Rede für ein Mitglied von Bündnis 90/Die Grünen zu schreiben. Ihr Ziel ist es, eine überzeugende und mitreißende Rede zu erstellen, die den Werten und Positionen der Partei entspricht und das gegebene Thema behandelt. 

Geben Sie vor der rede an: 1. 2-3 Unterschiedliche Ideen für den Einstieg, dann 2-3 Kernargumente, dann 2-3 gute Ideen für ein Ende. Gib dem Redner 2-3 Tipps, worauf er bei dieser rede und diesem thema achten muss, um zu überzeugen.
Schreibe anschließend eine Rede.

${HTML_FORMATTING_INSTRUCTIONS}

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

    // Erstelle den Benutzerinhalt basierend auf dem Vorhandensein eines benutzerdefinierten Prompts
    let userContent;
    
    // Build the specialized base content for speech generation
    const speechBaseContent = `Erstelle eine überzeugende politische Rede für Bündnis 90/Die Grünen gemäß den gegebenen Parametern.`;
    
    if (customPrompt) {
      // Bei benutzerdefiniertem Prompt diesen verwenden, aber mit Redeinformationen ergänzen
      const additionalInfo = `Zusätzliche Informationen zur Rede:
- Rolle/Position des Redners: ${rolle || 'Nicht angegeben'}
- Spezifisches Thema oder Anlass der Rede: ${thema || 'Nicht angegeben'}
- Zielgruppe: ${Zielgruppe || 'Nicht angegeben'}
- Besondere Schwerpunkte oder lokale Aspekte: ${schwerpunkte || 'Nicht angegeben'}
- Gewünschte Redezeit (in Minuten): ${redezeit || 'Nicht angegeben'}`;

      userContent = formatUserContent({
        customPrompt,
        baseContent: speechBaseContent,
        currentDate,
        additionalInfo
      });
    } else {
      // Standardinhalt ohne benutzerdefinierten Prompt
      userContent = `Rolle/Position des Redners: ${rolle}
Spezifisches Thema oder Anlass der Rede: ${thema}
Zielgruppe: ${Zielgruppe}
Besondere Schwerpunkte oder lokale Aspekte: ${schwerpunkte}
Gewünschte Redezeit (in Minuten): ${redezeit}
Aktuelles Datum: ${currentDate}

${speechBaseContent}`;
    }

    // Add title generation instruction to user content
    userContent += TITLE_GENERATION_INSTRUCTION;

    const payload = {
      systemPrompt,
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: userContent
        }]
      }],
      options: {
        max_tokens: 4000,
        temperature: 0.3
      },

    };
    
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'rede',
      ...payload
    });

    if (!result.success) throw new Error(result.error);
    
    const processedResult = processResponseWithTitle(result, '/claude_rede', { rolle, thema, Zielgruppe, schwerpunkte, redezeit });
    res.json({ 
      content: processedResult.content,
      metadata: processedResult.metadata
    });
  } catch (error) {
    console.error('Fehler bei der Redenerstellung:', error);
    res.status(500).json({ error: error.message });
  }
});

// Router for Election Program Generation (Wahlprogramm)
const wahlprogrammRouter = express.Router();

wahlprogrammRouter.post('/', async (req, res) => {
  const { thema, details, zeichenanzahl, customPrompt } = req.body;

  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  const systemPrompt = 'Du bist Schreiber des Wahlprogramms einer Gliederung von Bündnis 90/Die Grünen.';
  
  let userContent;
  
  // Build the specialized base content for election program generation
  const wahlprogrammBaseContent = `Beachte dabei folgende Punkte:

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
- Abwechslungsreicher Satzbau

${HTML_FORMATTING_INSTRUCTIONS}`;
  
  if (customPrompt) {
    const additionalInfo = `Zusätzliche Informationen (falls relevant):
- Thema: ${thema || 'Nicht angegeben'}
- Details: ${details || 'Nicht angegeben'}
- Gewünschte Zeichenanzahl: ${zeichenanzahl || 'Nicht angegeben'}`;

    userContent = formatUserContent({
      customPrompt,
      baseContent: wahlprogrammBaseContent,
      currentDate,
      additionalInfo
    });
  } else {
    userContent = `Erstelle ein Kapitel für ein Wahlprogramm zum Thema ${thema} im Stil des vorliegenden Dokuments.

Aktuelles Datum: ${currentDate}

Berücksichtige dabei folgende Details und Schwerpunkte:
${details}

Das Kapitel soll etwa ${zeichenanzahl} Zeichen umfassen.

${wahlprogrammBaseContent}`;
  }

  // Add title generation instruction to user content
  userContent += TITLE_GENERATION_INSTRUCTION;

  const payload = {
    systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    options: {
      max_tokens: 4000,
      temperature: 0.3
          }
  };
  
  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'wahlprogramm',
      systemPrompt: payload.systemPrompt,
      prompt: userContent, // Worker expects 'prompt' for this type
      options: payload.options,

    });

    if (!result.success) throw new Error(result.error);
    
    const processedResult = processResponseWithTitle(result, '/claude_wahlprogramm', { thema, details, zeichenanzahl });
    res.json({ 
      content: processedResult.content,
      metadata: processedResult.metadata
    });
  } catch (error) {
    console.error('Fehler bei der Wahlprogramm-Erstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung des Wahlprogramms',
      details: error.message
    });
  }
});

module.exports = {
  universalRouter,
  redeRouter,
  wahlprogrammRouter
}; 