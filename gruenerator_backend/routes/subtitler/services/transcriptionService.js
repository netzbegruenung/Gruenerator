const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { nodewhisper } = require('nodejs-whisper');
const { transcribeWithOpenAI } = require('./openAIService');
const { extractAudio } = require('./videoUploadService');

// Hilfsfunktion zum Parsen der Zeitstempel
function parseTimestamp(timestamp) {
  const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return 0;
  
  const [_, hours, minutes, seconds, ms] = match;
  return (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(ms) / 1000);
}

// Hilfsfunktion zum Ausführen von Whisper
async function transcribeVideoLocal(videoPath, language = 'de') {
  try {
    const outputDir = path.join(__dirname, '../../../uploads/transcriptions');
    await fs.mkdir(outputDir, { recursive: true });
    
    // Extrahiere optimierte Audio für Whisper
    const audioPath = path.join(outputDir, `audio_${Date.now()}.mp3`);
    await extractAudio(videoPath, audioPath);
    
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
    
    // Nutze die optimierte Audiodatei statt Video
    const result = await nodewhisper(audioPath, whisperConfig);
    const transcription = typeof result === 'string' ? result : result.text;
    
    // Cleanup Audio-Datei nach Transkription
    try {
      await fs.unlink(audioPath);
      console.log('Temporäre Audio-Datei gelöscht:', audioPath);
    } catch (err) {
      console.warn('Konnte temporäre Audio-Datei nicht löschen:', err);
    }
    
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
    console.error('Fehler bei der lokalen Transkription:', error);
    throw error;
  }
}

// Neue Hauptfunktion die beide Methoden unterstützt
async function transcribeVideo(videoPath, method = 'openai', language = 'de') {
  try {
    if (method === 'local') {
      return await transcribeVideoLocal(videoPath, language);
    } else {
      // Extrahiere optimierte Audio für OpenAI Whisper
      const outputDir = path.join(__dirname, '../../../uploads/transcriptions');
      await fs.mkdir(outputDir, { recursive: true });
      const audioPath = path.join(outputDir, `audio_${Date.now()}.mp3`);
      await extractAudio(videoPath, audioPath);
      
      const rawText = await transcribeWithOpenAI(audioPath);
      
      // Cleanup Audio-Datei nach Transkription
      try {
        await fs.unlink(audioPath);
        console.log('Temporäre Audio-Datei gelöscht:', audioPath);
      } catch (err) {
        console.warn('Konnte temporäre Audio-Datei nicht löschen:', err);
      }
      
      // Konvertiere OpenAI Text in das gleiche Format wie lokale Whisper Ausgabe
      const words = rawText.split(' ');
      const wordsPerSegment = 10;
      const segments = [];
      let currentTime = 0;
      
      for (let i = 0; i < words.length; i += wordsPerSegment) {
        const segmentWords = words.slice(i, i + wordsPerSegment);
        const duration = 3; // Ungefähre Dauer pro Segment in Sekunden
        
        const startTime = currentTime;
        const endTime = currentTime + duration;
        currentTime = endTime;
        
        const startMin = Math.floor(startTime / 60);
        const startSec = Math.round(startTime % 60);
        const endMin = Math.floor(endTime / 60);
        const endSec = Math.round(endTime % 60);
        
        const formattedStart = `${startMin}:${startSec.toString().padStart(2, '0')}`;
        const formattedEnd = `${endMin}:${endSec.toString().padStart(2, '0')}`;
        
        segments.push(`${formattedStart} - ${formattedEnd}\n${segmentWords.join(' ')}`);
      }
      
      return segments.join('\n\n');
    }
  } catch (error) {
    console.error(`Fehler bei der Transkription (${method}):`, error);
    throw error;
  }
}

module.exports = {
  transcribeVideo,
  transcribeVideoLocal
}; 