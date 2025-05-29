const express = require('express');

/**
 * Generates short subtitles using an AI model via the AI Worker Pool.
 * Currently configured for Claude's prompt structure.
 */
async function generateShortSubtitlesViaAI(text, words, aiWorkerPool, useBackupProvider = false) {
    if (!text || !Array.isArray(words) || words.length === 0) {
        throw new Error('Volltext (text) und Wort-Timestamps (words) sind für die AI-Untertitelgenerierung erforderlich.');
    }

    // System prompt defining the AI's role
    const systemPrompt = 'Du bist ein Experte für die Erstellung von prägnanten Untertiteln für Social-Media-Videos (Reels).';

    // Detailed instructions and data in the user message
    const userContent = `Deine Aufgabe ist es, aus einem gegebenen Volltext und den dazugehörigen Wort-Timestamps kurze, gut lesbare Untertitel-Segmente zu generieren.

**KRITISCHE FORMATANFORDERUNGEN:**
Du MUSST das Ergebnis EXAKT in diesem Format zurückgeben:

MM:SS - MM:SS
Segment Text 1

MM:SS - MM:SS
Segment Text 2

MM:SS - MM:SS
Segment Text 3

**WICHTIGE ZEITBEGRENZUNG:**
- Du darfst NUR Untertitel für tatsächlich gesprochene Wörter erzeugen
- Orientiere dich STRIKT an den gegebenen Wort-Timestamps
- Erzeuge KEINE Untertitel für Zeitbereiche ohne Wörter (z.B. Pausen, Applaus, Musik)
- Das letzte Segment darf NICHT über den Zeitstempel des letzten Wortes hinausragen

**Richtlinien:**
1.  **Segmentierung:** Erstelle Segmente, die natürlich klingen und logische Sinneinheiten bilden. Orientiere dich an den Wort-Timestamps, aber fasse Wörter sinnvoll zusammen.
2.  **Kürze:** Jedes Segment darf maximal 40 Zeichen (inklusive Leerzeichen) enthalten. Wenn ein Satz länger ist, teile ihn sinnvoll auf mehrere Segmente auf. Priorisiere die genaue zeitliche Übereinstimmung mit dem gesprochenen Wort über das Erreichen der maximalen Zeichenlänge. Es ist besser, ein Segment etwas kürzer zu machen und dafür synchron zu sein, als es künstlich zu verlängern, um mehr Text unterzubringen.
3.  **Timing-Präzision:**
    - Die Startzeit des Segments sollte dem 'start'-Timestamp des ersten Wortes im Segment entsprechen.
    - Die Endzeit des Segments sollte dem 'end'-Timestamp des letzten Wortes im Segment entsprechen. Das Ziel ist es, den Text anzuzeigen, solange er gesprochen wird, aber nicht unnötig darüber hinaus.
    - NIEMALS Segmente über die tatsächlichen Wort-Zeiten hinaus verlängern
4.  **Zeitformat MM:SS (für die Ausgabe):**
    - Konvertiere die präzisen Start- und Endzeiten der Segmente (ursprünglich in Sekunden mit Dezimalstellen aus den Wort-Timestamps) in das MM:SS Format für die Ausgabe.
    - Runde hierbei die Startsekunde des Segments IMMER AB (floor) zur nächsten vollen Sekunde.
    - Runde die Endsekunde des Segments IMMER AUF (ceil) zur nächsten vollen Sekunde.
    - Beispiel: Ein Segment, das laut Wort-Timestamps von 5.72s bis 8.18s geht.
      - Start für Ausgabe: 5.72s wird zu 00:05.
      - Ende für Ausgabe: 8.18s wird zu 00:09.
      - Resultierender Zeitstempel: 00:05 - 00:09
    - **WICHTIG ZUR VERMEIDUNG VON ÜBERLAPPUNGEN:**
      - Die **gerundete Startzeit (MM:SS)** eines Segments muss **strikt GRÖSSER** sein als die **gerundete Endzeit (MM:SS)** des **direkt vorhergehenden** Segments.
      - Beispiel: Wenn Segment A bei \`00:08 - 00:12\` endet, muss Segment B frühestens bei \`00:13\` beginnen (z.B. \`00:13 - 00:15\`).
      - Es darf **KEINE IDENTISCHEN ODER SICH ÜBERSCHNEIDENDEN ZEITMARKEN** zwischen den gerundeten Zeitstempeln aufeinanderfolgender Segmente geben. Wenn ein Segment bei \`MM:SS_A - MM:SS_B\` endet und das nächste Segment bei \`MM:SS_C - MM:SS_D\` beginnt, muss \`MM:SS_C\` immer mindestens \`MM:SS_B + 1 Sekunde\` sein.

**AUSGABEFORMAT:**
- Jedes Segment: Zeitstempel-Zeile, dann Text-Zeile, dann Leerzeile
- Keine Anführungszeichen, keine Backticks, keine Markdown-Formatierung
- Nur der reine Untertiteltext

**Eingabedaten:**

Volltext:
\`\`\`
${text}
\`\`\`

Wort-Timestamps (JSON-Format):
\`\`\`json
${JSON.stringify(words, null, 2)}
\`\`\`

Gib NUR den formatierten Untertiteltext zurück, ohne weitere Erklärungen.`;

    console.log(`[ShortSubtitleGenerator] Anfrage an Claude: ${text.length} chars, ${words.length} Wörter`);
    
    // Log first few word timestamps for debugging
    console.log(`[ShortSubtitleGenerator] Erste 3 Wort-Timestamps:`, words.slice(0, 3).map(w => `"${w.word}": ${w.start.toFixed(2)}s-${w.end.toFixed(2)}s`));

    try {
        const result = await aiWorkerPool.processRequest({
            type: 'claude_short_subtitles',
            systemPrompt,
            messages: [{
                role: "user",
                content: [{
                    type: "text",
                    text: userContent
                }]
            }],
            options: {
                temperature: 0.3
            },
            useBackupProvider
        });

        if (!result.success) {
            console.error(`[ShortSubtitleGenerator] AI Worker Fehler: ${result.error}`);
            throw new Error(result.error || 'Unbekannter Fehler vom AI Worker Pool');
        }

        console.log(`[ShortSubtitleGenerator] Claude Antwort erhalten: ${result.content?.length} chars`);
        
        // Log first segment of Claude's response for timing verification
        const firstSegment = result.content?.split('\n\n')[0];
        if (firstSegment) {
            const lines = firstSegment.split('\n');
            if (lines.length >= 2) {
                console.log(`[ShortSubtitleGenerator] Erstes Claude Segment: ${lines[0]} | "${lines[1]}"`);
            }
        }
        
        return result.content.trim();

    } catch (error) {
        console.error('[ShortSubtitleGenerator] AI Worker Kommunikationsfehler:', error.message);
        throw new Error(`Fehler bei der Erstellung der kurzen Untertitel durch AI: ${error.message}`);
    }
}

module.exports = {
    generateShortSubtitlesViaAI
}; 