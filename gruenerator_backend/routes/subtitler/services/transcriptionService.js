const path = require('path');
const fs = require('fs').promises;
const { nodewhisper } = require('nodejs-whisper');

// Hilfsfunktion zum Parsen der Zeitstempel
function parseTimestamp(timestamp) {
  const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return 0;
  
  const [_, hours, minutes, seconds, ms] = match;
  return (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(ms) / 1000);
}

// Hilfsfunktion zum Ausführen von Whisper
async function transcribeVideo(videoPath, language = 'de') {
  try {
    const outputDir = path.join(__dirname, '../../../uploads/transcriptions');
    await fs.mkdir(outputDir, { recursive: true });
    
    const whisperConfig = {
      modelName: "base",
      whisperOptions: {
        language: language,
        task: "transcribe",
        timestamps_length: 50,
        wordTimestamps: false,
        splitOnWord: true,
        outputInSrt: true
      }
    };
    
    console.log('Whisper-Konfiguration:', whisperConfig.whisperOptions);
    
    const result = await nodewhisper(videoPath, whisperConfig);
    const transcription = typeof result === 'string' ? result : result.text;
    
    if (!transcription) {
      console.error('Keine Transkription im Ergebnis');
      throw new Error('Keine Transkription erhalten');
    }

    // Verarbeitung der Zeitstempel und Text-Bereinigung
    const segments = [];
    const lines = transcription.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const timestampMatch = line.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.*)/);
      if (timestampMatch) {
        const [_, startStr, endStr, text] = timestampMatch;
        const startTime = parseTimestamp(startStr);
        const endTime = parseTimestamp(endStr);
        
        if (text.trim()) {
          segments.push({
            startTime,
            endTime,
            text: text.trim()
          });
        }
      }
    }

    if (segments.length === 0) {
      throw new Error('Keine Untertitel generiert');
    }

    // Log nur die wichtigsten Segment-Infos
    console.log('Transkription:', {
      segmente: segments.length,
      gesamtDauer: `${(segments[segments.length-1].endTime - segments[0].startTime).toFixed(1)}s`,
      durchschnittsDauer: `${((segments[segments.length-1].endTime - segments[0].startTime) / segments.length).toFixed(1)}s`
    });

    // Konvertiere zu benutzerfreundlichem Format
    return segments
      .map(segment => {
        const startMin = Math.floor(segment.startTime / 60);
        const startSec = Math.round(segment.startTime % 60);
        const endMin = Math.floor(segment.endTime / 60);
        const endSec = Math.round(segment.endTime % 60);
        
        const formattedStart = `${startMin}:${startSec.toString().padStart(2, '0')}`;
        const formattedEnd = `${endMin}:${endSec.toString().padStart(2, '0')}`;
        
        return `${formattedStart} - ${formattedEnd}\n${segment.text}`;
      })
      .join('\n\n');

  } catch (error) {
    console.error('Fehler bei der Transkription:', error);
    throw error;
  }
}

module.exports = {
  transcribeVideo
}; 