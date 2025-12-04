const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('subtitleCorrect');

/**
 * Cleans corrected text by removing markdown formatting and unwanted prefixes.
 * Acts as a safety net in case the AI doesn't follow instructions.
 */
function cleanCorrectedText(text) {
    if (!text || typeof text !== 'string') return text;

    return text
        // Remove markdown bold **text**
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        // Remove markdown italic *text*
        .replace(/\*([^*]+)\*/g, '$1')
        // Remove markdown bold __text__
        .replace(/__([^_]+)__/g, '$1')
        // Remove markdown italic _text_
        .replace(/_([^_]+)_/g, '$1')
        // Remove common prefixes the AI might add
        .replace(/^(Untertitel|Korrektur|Korrigiert|Text|Segment):\s*/i, '')
        // Remove quotes if the entire text is wrapped
        .replace(/^["„"](.+)[""]$/g, '$1')
        .trim();
}

/**
 * Corrects subtitle segments for grammar, spelling, and punctuation using AI.
 * Returns only segments that need corrections.
 */
async function correctSubtitlesViaAI(segments, aiWorkerPool) {
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
        throw new Error('Untertitel-Segmente sind für die Korrektur erforderlich.');
    }

    const systemPrompt = `Du bist ein deutscher Rechtschreib- und Grammatik-Assistent für Untertitel.
Prüfe die folgenden Untertitel-Segmente auf Rechtschreib-, Grammatik- und Zeichensetzungsfehler.

WICHTIG:
- Ändere NICHT den Inhalt, Stil oder die Bedeutung
- Korrigiere NUR eindeutige Fehler (Rechtschreibung, Grammatik, Zeichensetzung)
- Gib NUR Segmente zurück, die Korrekturen benötigen
- Behalte die Segment-IDs bei

AUSGABEFORMAT - STRIKT EINHALTEN:
- "original": Exakt der ursprüngliche Text
- "corrected": NUR der korrigierte Reintext
- KEINE Präfixe wie "Untertitel:", "Korrektur:", "Text:" etc.
- KEINE Markdown-Formatierung (**fett**, *kursiv*, __unterstrichen__)
- KEINE Anführungszeichen um den Text
- NUR der reine korrigierte Text

Beispiel:
FALSCH: { "corrected": "Untertitel: Das ist **korrigiert**" }
RICHTIG: { "corrected": "Das ist korrigiert" }

Antworte mit validem JSON:
{
  "corrections": [
    { "id": 0, "original": "fehlerhafter text", "corrected": "korrigierter text" }
  ],
  "hasCorrections": true
}

Wenn KEINE Korrekturen nötig sind:
{ "corrections": [], "hasCorrections": false }`;

    const segmentsForReview = segments.map(s => ({
        id: s.id,
        text: s.text
    }));

    const userContent = `Prüfe diese Untertitel-Segmente auf Fehler:

${JSON.stringify(segmentsForReview, null, 2)}

Antworte NUR mit dem JSON-Objekt, keine weiteren Erklärungen.`;

    log.debug(`[SubtitleCorrection] Anfrage an AI: ${segments.length} Segmente`);

    try {
        const result = await aiWorkerPool.processRequest({
            type: 'claude_subtitle_correction',
            systemPrompt,
            messages: [{
                role: "user",
                content: [{
                    type: "text",
                    text: userContent
                }]
            }],
            options: {
                temperature: 0.1,
                max_tokens: 4096
            }
        });

        if (!result.success) {
            log.error(`[SubtitleCorrection] AI Worker Fehler: ${result.error}`);
            throw new Error(result.error || 'Unbekannter Fehler vom AI Worker Pool');
        }

        log.debug(`[SubtitleCorrection] AI Antwort erhalten: ${result.content?.length} chars`);

        // Parse the JSON response
        let parsedResponse;
        try {
            // Clean the response - remove markdown code blocks if present
            let cleanContent = result.content.trim();
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            parsedResponse = JSON.parse(cleanContent);
        } catch (parseError) {
            log.error(`[SubtitleCorrection] JSON Parse Fehler: ${parseError.message}`);
            log.error(`[SubtitleCorrection] Raw response: ${result.content}`);
            throw new Error('Ungültige AI-Antwort: Konnte JSON nicht parsen');
        }

        // Validate response structure
        if (!parsedResponse || typeof parsedResponse.hasCorrections !== 'boolean') {
            throw new Error('Ungültige AI-Antwort: Fehlende hasCorrections-Eigenschaft');
        }

        if (parsedResponse.hasCorrections && !Array.isArray(parsedResponse.corrections)) {
            throw new Error('Ungültige AI-Antwort: corrections muss ein Array sein');
        }

        log.debug(`[SubtitleCorrection] Korrekturen gefunden: ${parsedResponse.hasCorrections}, Anzahl: ${parsedResponse.corrections?.length || 0}`);

        // Clean all corrected text to remove any markdown or prefixes
        const cleanedCorrections = (parsedResponse.corrections || []).map(correction => ({
            ...correction,
            corrected: cleanCorrectedText(correction.corrected)
        }));

        return {
            corrections: cleanedCorrections,
            hasCorrections: parsedResponse.hasCorrections
        };

    } catch (error) {
        log.error('[SubtitleCorrection] Fehler:', error.message);
        throw new Error(`Fehler bei der Untertitel-Korrektur: ${error.message}`);
    }
}

module.exports = {
    correctSubtitlesViaAI
};
