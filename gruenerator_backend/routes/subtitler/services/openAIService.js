const fs = require('fs');
const { OpenAI } = require('openai');

const client = new OpenAI();

// Hilfsfunktion zum Formatieren von Segmenten in Text
function formatSegmentsToText(segments) {
  if (!Array.isArray(segments)) {
    console.error('[openAIService] Invalid segments data for formatting:', segments);
    return ''; // Return empty string or throw error
  }
  return segments
    .map(segment => {
      // Validate segment structure
      if (typeof segment.start !== 'number' || typeof segment.end !== 'number' || typeof segment.text !== 'string') {
        console.warn('[openAIService] Skipping invalid segment during formatting:', segment);
        return null; // Skip invalid segments
      }
      const startMinutes = Math.floor(segment.start / 60);
      const startSeconds = Math.floor(segment.start % 60);
      const endMinutes = Math.floor(segment.end / 60);
      const endSeconds = Math.floor(segment.end % 60);
      
      // Ensure start time is not greater than end time after rounding
      const startTimeTotal = startMinutes * 60 + startSeconds;
      let endTimeTotal = endMinutes * 60 + endSeconds;
      if (startTimeTotal >= endTimeTotal) {
         // If rounding makes end <= start, add 1 second to end time
         // This handles cases where segments are very short
         endTimeTotal = startTimeTotal + 1;
         const correctedEndMinutes = Math.floor(endTimeTotal / 60);
         const correctedEndSeconds = Math.floor(endTimeTotal % 60);
         return `${startMinutes}:${String(startSeconds).padStart(2, '0')} - ${correctedEndMinutes}:${String(correctedEndSeconds).padStart(2, '0')}\n${segment.text.trim()}`;
      }
      
      return `${startMinutes}:${String(startSeconds).padStart(2, '0')} - ${endMinutes}:${String(endSeconds).padStart(2, '0')}\n${segment.text.trim()}`;
    })
    .filter(Boolean) // Remove null entries from skipped segments
    .join('\n\n');
}

// Hilfsfunktion zum Bereinigen überlappender Segmente
function cleanupSegments(segments) {
  const cleanedSegments = [];
  
  segments.forEach((segment, index) => {
    const start = Math.floor(segment.start);
    let end = Math.ceil(segment.end);
    
    // Wenn es ein nächstes Segment gibt und es überlappt
    if (segments[index + 1] && end > Math.floor(segments[index + 1].start)) {
      // Setze das Ende auf den Start des nächsten Segments
      end = Math.floor(segments[index + 1].start);
    }
    
    // Nur hinzufügen wenn das Segment mindestens 1 Sekunde lang ist
    if (end > start) {
      cleanedSegments.push({
        ...segment,
        start,
        end
      });
    }
  });
  
  return cleanedSegments;
}

// Hilfsfunktion zum Erstellen optimaler Segmente aus Wörtern
function createSegmentsFromWords(fullText, wordTimestamps, maxDuration = 4) {
    const segments = [];
    let currentSegment = {
        text: '',
        start: wordTimestamps[0].start,
        end: wordTimestamps[0].end
    };
    
    let lastEndIndex = 0;
    
    wordTimestamps.forEach((word, index) => {
        const segmentDuration = word.end - currentSegment.start;
        
        // Prüfe auf maximale und minimale Dauer
        if (segmentDuration > maxDuration || (index > 0 && segmentDuration < 1)) {
            // Text bis zum aktuellen Wort aus dem vollständigen Text extrahieren
            const endIndex = fullText.indexOf(word.word, lastEndIndex);
            currentSegment.text = fullText.substring(lastEndIndex, endIndex).trim();
            currentSegment.end = word.start; // Korrekte End-Zeit setzen
            
            // Nur hinzufügen wenn das Segment mindestens 1 Sekunde lang ist
            if (currentSegment.end - currentSegment.start >= 1) {
                segments.push(currentSegment);
            }
            
            // Neues Segment starten
            currentSegment = {
                text: '',
                start: word.start,
                end: word.end
            };
            lastEndIndex = endIndex;
        }
    });
    
    // Letztes Segment
    if (lastEndIndex < fullText.length) {
        currentSegment.text = fullText.substring(lastEndIndex).trim();
        if (currentSegment.end - currentSegment.start >= 1) {
            segments.push(currentSegment);
        }
    }
    
    return segments;
}

async function transcribeWithOpenAI(filePath, requestWordTimestamps = false) {
  try {
    // Log der Dateigröße vor dem Senden
    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`[openAIService] Sende Audio an OpenAI (${fileSizeMB} MB): ${filePath}`);
    
    const audioFile = fs.createReadStream(filePath);
    const granularity = requestWordTimestamps ? ["word"] : ["segment"];
    console.log(`[openAIService] OpenAI Whisper wird verwendet mit Granularität: ${granularity}`);
    
    const transcription = await client.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      language: "de",
      response_format: "verbose_json",
      timestamp_granularities: granularity,
      prompt: "Dies ist ein Instagram Reel. Erstelle kurze, prägnante Untertitel. Achte auf natürliche Satzpausen für die Segmentierung."
    });
    
    console.log('[openAIService] Rohdaten von OpenAI erhalten.');

    if (requestWordTimestamps) {
      // Gib das gesamte Objekt zurück, wenn Wort-Timestamps angefordert wurden
      // Stelle sicher, dass die erwarteten Felder vorhanden sind
      if (!transcription || typeof transcription.text !== 'string' || !Array.isArray(transcription.words)) {
         console.error('[openAIService] Ungültige Antwort von OpenAI bei Anforderung von Wort-Timestamps:', transcription);
         throw new Error('Ungültige Wort-Timestamp-Antwort von OpenAI');
      }
      console.log(`[openAIService] Gebe Wort-Timestamps zurück (Textlänge: ${transcription.text.length}, Wörter: ${transcription.words.length}).`);
      return { text: transcription.text, words: transcription.words };
    } else {
      // Formatiere die Segmente in das gewünschte Textformat
      if (!transcription || !Array.isArray(transcription.segments)) {
        console.error('[openAIService] Ungültige Antwort von OpenAI bei Anforderung von Segment-Timestamps:', transcription);
        throw new Error('Ungültige Segment-Timestamp-Antwort von OpenAI');
      }
      console.log(`[openAIService] Formatiere ${transcription.segments.length} Segmente.`);
      const formattedText = formatSegmentsToText(transcription.segments);
      // Ensure the return format is consistent with the word timestamp case
      return { text: formattedText }; // Return an object with the text property
    }

  } catch (error) {
    console.error('[openAIService] OpenAI Transkriptionsfehler:', error);
    // Re-throw error damit der aufrufende Service es handhaben kann
    throw error; 
  }
}

module.exports = {
  transcribeWithOpenAI,
  formatSegmentsToText // Exportiere die Formatierungsfunktion
}; 