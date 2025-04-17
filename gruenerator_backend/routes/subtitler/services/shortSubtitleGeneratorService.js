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

**Richtlinien:**
1.  **Segmentierung:** Erstelle Segmente, die natürlich klingen und logische Sinneinheiten bilden. Orientiere dich an den Wort-Timestamps, aber fasse Wörter sinnvoll zusammen.
2.  **Kürze:** Jedes Segment darf maximal 40 Zeichen (inklusive Leerzeichen) enthalten. Wenn ein Satz länger ist, teile ihn sinnvoll auf mehrere Segmente auf.
3.  **Timing:** Verwende die 'start'-Zeit des ersten Wortes und die 'end'-Zeit des letzten Wortes im Segment für die Zeitstempel. Die originalen Timestamps liegen in Sekunden vor. Stelle sicher, dass die Segmente nicht überlappen und einen minimalen Abstand von 0.1 Sekunden haben.
4.  **Format:** Gib das Ergebnis EXAKT im folgenden Format zurück, wobei jedes Segment durch eine doppelte Leerzeile getrennt ist:
    \`\`\`
    MM:SS - MM:SS
    Segment Text 1

    MM:SS - MM:SS
    Segment Text 2
    \`\`\`
    **Wichtige Schritte zur Zeitformatierung:**
    a. Ermittle die Start- und Endzeit des Segments in Sekunden aus den Wort-Timestamps.
    b. **Runde** die Startzeit auf die nächste ganze Sekunde **ab** (z.B. wird 5.7 zu 5).
    c. **Runde** die Endzeit auf die nächste ganze Sekunde **auf** (z.B. wird 8.1 zu 9).
    d. **Konvertiere** diese gerundeten Sekundenwerte in das Format \`MM:SS\`.
       - \`SS\` sind die Sekunden (0-59), zweistellig mit führender Null (z.B. \`05\`, \`12\`).
       - \`MM\` sind die vollen Minuten, zweistellig mit führender Null. Da die Videos kurz sind, wird dies meistens \`00\` sein.
    e. **Beispiel:** Ein Segment dauert von Sekunde 5.7 bis 8.1.
       - Startzeit gerundet: 5 Sekunden.
       - Endzeit gerundet: 9 Sekunden.
       - Formatierte Ausgabe: \`00:05 - 00:09\`
    f. Der Text jedes Segments steht in einer eigenen Zeile direkt unter dem Zeitstempel.
    g. Verwende keine zusätzliche Formatierung (wie HTML-Tags, Markdown etc.).
5.  Satzzeichen: Behalte Satzzeichen (wie . , ? !) am Ende von Segmenten immer bei.
6.  Worttrennung: Wörter dürfen am Ende oder Anfang eines Segments nicht getrennt werden, auch Begriffe mit Bindestrichen nicht. Jedes Wort muss vollständig in einem Segment enthalten sein.

**Ziel:** Erstelle Untertitel, die schnell erfassbar sind und gut in einem vertikalen Reel-Format funktionieren. Die Zeitangaben müssen die tatsächliche Dauer in Sekunden korrekt widerspiegeln, formatiert als \`MM:SS\`.

**Eingabedaten:**

Volltext:
\`\`\`
${text}
\`\`\`

Wort-Timestamps (JSON-Format):
\`\`\`json
${JSON.stringify(words, null, 2)}
\`\`\`

Bitte befolge die Anweisungen genau und gib nur den formatierten Untertiteltext zurück.`;

    console.log(`[ShortSubtitleGeneratorService] Anfrage an AI Worker Pool mit Textlänge ${text.length}, ${words.length} Wörtern.`);

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
            console.error(`[ShortSubtitleGeneratorService] Fehler von AI Worker Pool: ${result.error}`);
            throw new Error(result.error || 'Unbekannter Fehler vom AI Worker Pool');
        }

        console.log(`[ShortSubtitleGeneratorService] Erfolgreiche Antwort vom AI Worker Pool erhalten. Länge: ${result.content?.length}`);
        return result.content.trim();

    } catch (error) {
        console.error('[ShortSubtitleGeneratorService] Fehler bei der Kommunikation mit dem AI Worker Pool:', error);
        throw new Error(`Fehler bei der Erstellung der kurzen Untertitel durch AI: ${error.message}`);
    }
}

module.exports = {
    generateShortSubtitlesViaAI
}; 