const fs = require('fs');
const { OpenAI } = require('openai');

const client = new OpenAI();

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

async function transcribeWithOpenAI(filePath) {
  try {
    // Log der Dateigröße vor dem Senden
    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`Sende Audio an OpenAI (${fileSizeMB} MB): ${filePath}`);
    
    const audioFile = fs.createReadStream(filePath);
    console.log('OpenAI Whisper wird verwendet');
    const transcription = await client.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      language: "de",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      prompt: "Dies ist ein Instagram Reel. Erstelle kurze, prägnante Untertitel. Achte auf natürliche Satzpausen für die Segmentierung."
    });
    
    console.log('Erhaltene Untertitel von OpenAI:', transcription);

    // Formatiere die Segmente in das gewünschte Format
    const formattedText = transcription.segments
      .map(segment => {
        const startMinutes = Math.floor(segment.start / 60);
        const startSeconds = Math.floor(segment.start % 60);
        const endMinutes = Math.floor(segment.end / 60);
        const endSeconds = Math.floor(segment.end % 60);
        
        return `${startMinutes}:${String(startSeconds).padStart(2, '0')} - ${endMinutes}:${String(endSeconds).padStart(2, '0')}\n${segment.text}`;
      })
      .join('\n\n');
    
    return formattedText;
  } catch (error) {
    console.error('OpenAI Transkriptionsfehler:', error);
    throw error;
  }
}

module.exports = {
  transcribeWithOpenAI
}; 