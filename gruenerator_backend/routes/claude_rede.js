const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { rolle, thema, Zielgruppe, schwerpunkte, redezeit, useBackupProvider, customPrompt } = req.body;

  try {
    // Systemanweisung für die Redenerstellung
    const systemPrompt = `Sie sind damit beauftragt, eine politische Rede für ein Mitglied von Bündnis 90/Die Grünen zu schreiben. Ihr Ziel ist es, eine überzeugende und mitreißende Rede zu erstellen, die den Werten und Positionen der Partei entspricht und das gegebene Thema behandelt. 

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

    // Erstelle den Benutzerinhalt basierend auf dem Vorhandensein eines benutzerdefinierten Prompts
    let userContent;
    
    if (customPrompt) {
      // Bei benutzerdefiniertem Prompt diesen verwenden, aber mit Redeinformationen ergänzen
      userContent = `Benutzerdefinierter Prompt: ${customPrompt}

Zusätzliche Informationen zur Rede:
- Rolle/Position des Redners: ${rolle || 'Nicht angegeben'}
- Spezifisches Thema oder Anlass der Rede: ${thema || 'Nicht angegeben'}
- Zielgruppe: ${Zielgruppe || 'Nicht angegeben'}
- Besondere Schwerpunkte oder lokale Aspekte: ${schwerpunkte || 'Nicht angegeben'}
- Gewünschte Redezeit (in Minuten): ${redezeit || 'Nicht angegeben'}`;
    } else {
      // Standardinhalt ohne benutzerdefinierten Prompt
      userContent = `Rolle/Position des Redners: ${rolle}
Spezifisches Thema oder Anlass der Rede: ${thema}
Zielgruppe: ${Zielgruppe}
Besondere Schwerpunkte oder lokale Aspekte: ${schwerpunkte}
Gewünschte Redezeit (in Minuten): ${redezeit}`;
    }

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'rede',
      systemPrompt,
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: userContent
        }]
      }],
      options: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.3
      },
      useBackupProvider
    });

    if (!result.success) throw new Error(result.error);
    res.json({ content: result.content });
  } catch (error) {
    console.error('Fehler bei der Redenerstellung:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;