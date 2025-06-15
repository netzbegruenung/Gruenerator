const express = require('express');

/**
 * Generates short subtitles using an AI model via the AI Worker Pool.
 * Currently configured for Claude's prompt structure.
 */
async function generateShortSubtitlesViaAI(text, words, aiWorkerPool) {
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

**OBERSTE PRIORITÄT: ZEITLICHE PRÄZISION**
- Zeitliche Präzision ist WICHTIGER als sinnvolle Satztrennung
- Du darfst NUR Untertitel für tatsächlich gesprochene Wörter erzeugen
- Orientiere dich STRIKT an den gegebenen Wort-Timestamps
- Erzeuge KEINE Untertitel für Zeitbereiche ohne Wörter
- Das letzte Segment darf NICHT über den Zeitstempel des letzten Wortes hinausragen
- KÜRZE SEGMENTE LIEBER, anstatt das Timing zu verfälschen

**Richtlinien (in Prioritätsreihenfolge):**
1.  **TIMING-PRÄZISION (HÖCHSTE PRIORITÄT):**
    - Die Startzeit des Segments MUSS dem 'start'-Timestamp des ersten Wortes entsprechen
    - Die Endzeit des Segments MUSS dem 'end'-Timestamp des letzten Wortes entsprechen
    - **AUSNAHME - Lesezeit bei Redepausen:** Wenn nach einem Segment eine Redepause von 1-2 Sekunden folgt (keine neuen Wörter), verlängere das Segment um diese Pause für bessere Lesbarkeit
    - NIEMALS Segmente über die tatsächlichen Wort-Zeiten hinaus verlängern (außer bei obiger Redepausen-Regel)
    - Wenn zwischen Wörtern längere Pausen (>2s) sind, erstelle separate Segmente

2.  **0-SEKUNDEN-TIMESTAMPS VERMEIDEN:**
    - NIEMALS Segmente mit identischer Start- und Endzeit erstellen (z.B. 1:41 - 1:41)
    - Wenn ein Segment nach Rundung 0 Sekunden hätte, teile es in die benachbarten Segmente auf
    - Priorisiere dabei die zeitliche Nähe zum tatsächlich gesprochenen Wort

3.  **Segmentlänge:** Maximal 40 Zeichen pro Segment. Wenn nötig, teile mitten im Satz auf, um das Timing einzuhalten.

4.  **Zeitformat MM:SS (für die Ausgabe) - ÜBERLAPPUNGSFREIE RUNDUNG:**
    - Verwende die exakten Wort-Timestamps für die Segmentierung
    - Für die MM:SS Ausgabe: Runde Startsekunde AB (floor), Endsekunde AUF (ceil)
    - **KRITISCH: Überlappungsvermeidung beim Runden:**
      - Wenn das gerundete Ende von Segment A (MM:SS) >= gerundeter Start von Segment B (MM:SS) ist, dann:
      - Setze den Start von Segment B auf (Ende von Segment A + 1 Sekunde)
      - Beispiel: Segment A endet bei 5.8s (gerundet 00:06), Segment B startet bei 5.9s (würde zu 00:05 gerundet)
      - Lösung: Segment B startet in der Ausgabe bei 00:07 (00:06 + 1)
    - So bleiben die Segmente zeitlich präzise zu den Wörtern, aber überlappen nicht in der Anzeige

5.  **Segmentierung:** Nur wenn das Timing stimmt, versuche sinnvolle Wortgruppen zu bilden

**AUSGABEFORMAT:**
- Jedes Segment: Zeitstempel-Zeile, dann Text-Zeile, dann Leerzeile
- Keine Anführungszeichen, keine zusätzliche Formatierung
- Nur der reine Untertiteltext

**Eingabedaten:**

Volltext:
${text}

Wort-Timestamps (JSON-Format):
${JSON.stringify(words, null, 2)}

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
                  }
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