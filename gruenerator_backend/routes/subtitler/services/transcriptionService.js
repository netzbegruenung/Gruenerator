const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
// const { nodewhisper } = require('nodejs-whisper'); // Commented out - module not installed
const mistralVoiceService = require('../../voice/mistralVoiceService');
const { transcribeWithAssemblyAI, checkServiceHealth } = require('./assemblyAIService');
const { extractAudio } = require('./videoUploadService');
// UNUSED: Short subtitle generator service commented out - only manual mode is used
// const { generateShortSubtitlesViaAI } = require('./shortSubtitleGeneratorService');
const { generateManualSubtitles } = require('./manualSubtitleGeneratorService');
const { generateWordHighlightSubtitles } = require('./wordHighlightSubtitleService');
const { startBackgroundCompression } = require('./backgroundCompressionService');

// Configuration for transcription provider
const TRANSCRIPTION_PROVIDER = process.env.TRANSCRIPTION_PROVIDER || 'mistral';

/**
 * Transcribe audio using the configured provider with fallback support
 * @param {string} audioPath - Path to audio file
 * @param {boolean} requestWordTimestamps - Whether to request word timestamps
 * @returns {Promise<Object>} - Transcription result in consistent format
 */
async function transcribeWithProvider(audioPath, requestWordTimestamps = false) {
    console.log(`[transcriptionService] Using transcription provider: ${TRANSCRIPTION_PROVIDER}`);

    if (TRANSCRIPTION_PROVIDER === 'assemblyai') {
        try {
            // Check if AssemblyAI service is available
            const isHealthy = await checkServiceHealth();
            if (!isHealthy) {
                console.warn('[transcriptionService] AssemblyAI service health check failed, falling back to Mistral');
                return await transcribeWithMistral(audioPath, requestWordTimestamps);
            }

            console.log('[transcriptionService] Using AssemblyAI EU provider');
            return await transcribeWithAssemblyAI(audioPath, requestWordTimestamps);

        } catch (assemblyAIError) {
            console.error('[transcriptionService] AssemblyAI failed, falling back to Mistral:', assemblyAIError.message);
            console.log('[transcriptionService] Attempting Mistral fallback...');

            try {
                return await transcribeWithMistral(audioPath, requestWordTimestamps);
            } catch (mistralError) {
                console.error('[transcriptionService] Both AssemblyAI and Mistral failed');
                throw new Error(`Transcription failed: AssemblyAI (${assemblyAIError.message}), Mistral fallback (${mistralError.message})`);
            }
        }
    } else {
        // Default to Mistral
        console.log('[transcriptionService] Using Mistral provider');
        return await transcribeWithMistral(audioPath, requestWordTimestamps);
    }
}

/**
 * Transcribe audio using Mistral Voxtral
 * @param {string} audioPath - Path to audio file
 * @param {boolean} requestWordTimestamps - Whether to request word timestamps
 * @returns {Promise<Object>} - Transcription result in consistent format
 */
async function transcribeWithMistral(audioPath, requestWordTimestamps = false) {
    try {
        // Read the audio file
        const audioBuffer = await fs.readFile(audioPath);
        const filename = path.basename(audioPath);

        const options = {
            language: 'de',
            timestamp_granularities: requestWordTimestamps ? ['segment'] : undefined
        };

        const result = await mistralVoiceService.transcribeFromBuffer(audioBuffer, filename, options);

        // Convert to format expected by subtitle generators
        if (requestWordTimestamps) {
            // For word timestamps, we need to simulate the OpenAI format
            // Since Mistral doesn't provide word-level timestamps, we'll use segments
            return {
                text: result.text,
                words: result.segments ? convertSegmentsToWords(result.segments, result.text) : []
            };
        } else {
            return {
                text: result.segments ? formatSegmentsToText(result.segments) : result.text
            };
        }
    } catch (error) {
        console.error('[transcriptionService] Mistral transcription error:', error);
        throw error;
    }
}

/**
 * Convert Mistral segments to word-like format for compatibility
 */
function convertSegmentsToWords(segments, fullText) {
    const words = [];

    segments.forEach(segment => {
        const segmentWords = segment.text.trim().split(/\s+/);
        const segmentDuration = segment.end - segment.start;
        const wordDuration = segmentDuration / segmentWords.length;

        segmentWords.forEach((word, index) => {
            words.push({
                word: word,
                start: segment.start + (index * wordDuration),
                end: segment.start + ((index + 1) * wordDuration)
            });
        });
    });

    return words;
}

/**
 * Format segments to text (replaces OpenAI formatSegmentsToText)
 */
function formatSegmentsToText(segments) {
    if (!Array.isArray(segments)) {
        console.error('[transcriptionService] Invalid segments data for formatting:', segments);
        return '';
    }

    return segments
        .map(segment => {
            if (typeof segment.start !== 'number' || typeof segment.end !== 'number' || typeof segment.text !== 'string') {
                console.warn('[transcriptionService] Skipping invalid segment during formatting:', segment);
                return null;
            }

            const startMinutes = Math.floor(segment.start / 60);
            const startSeconds = Math.floor(segment.start % 60);
            const endMinutes = Math.floor(segment.end / 60);
            const endSeconds = Math.floor(segment.end % 60);

            return `${startMinutes}:${String(startSeconds).padStart(2, '0')} - ${endMinutes}:${String(endSeconds).padStart(2, '0')}\n${segment.text.trim()}`;
        })
        .filter(Boolean)
        .join('\n\n');
}

// UNUSED: parseTimestamp function commented out - only manual mode is used
/*
function parseTimestamp(timestamp) {
  const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return 0;
  
  const [_, hours, minutes, seconds, ms] = match;
  return (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(ms) / 1000);
}
*/

// Helper function to create short subtitles from word timestamps
/*
function createShortSubtitlesFromWords(fullText, wordTimestamps, maxWordsPerSegment = 5, maxDurationPerSegment = 3) {
  if (!wordTimestamps || wordTimestamps.length === 0) {
    console.warn("[transcriptionService] Empty or invalid word timestamps provided.");
    return "";
  }

  // Log raw word timestamps received from OpenAI
  console.log("[transcriptionService] Raw word timestamps:", JSON.stringify(wordTimestamps, null, 2));

  const segments = [];
  let currentSegmentWords = [];
  let currentSegmentStart = wordTimestamps[0].start;

  wordTimestamps.forEach((word, index) => {
    const potentialSegmentDuration = word.end - currentSegmentStart;

    // Add word to current segment if constraints are met
    if (currentSegmentWords.length < maxWordsPerSegment && potentialSegmentDuration <= maxDurationPerSegment) {
      currentSegmentWords.push(word.word);
    } else {
      // Finalize the previous segment
      const segmentText = currentSegmentWords.join(' ');
      const segmentEnd = index > 0 ? wordTimestamps[index - 1].end : word.end; // Use previous word's end time
      const segmentDuration = segmentEnd - currentSegmentStart;

      // Log potential segment before duration check
      console.log(`[transcriptionService] Potential segment: "${segmentText}", Duration: ${segmentDuration.toFixed(3)}s`);

      // Ensure segment duration is reasonable (e.g., >= 0.5s)
      if (segmentDuration >= 0.5) {
         segments.push({ start: currentSegmentStart, end: segmentEnd, text: segmentText });
      } else {
         // Log discarded segment
         console.log(`[transcriptionService] DISCARDED segment (too short): "${segmentText}", Duration: ${segmentDuration.toFixed(3)}s`);
      }

      // Start a new segment with the current word
      currentSegmentWords = [word.word];
      currentSegmentStart = word.start;
    }

    // Handle the last segment
    if (index === wordTimestamps.length - 1 && currentSegmentWords.length > 0) {
      const segmentText = currentSegmentWords.join(' ');
      const segmentEnd = word.end;
      const segmentDuration = segmentEnd - currentSegmentStart;

      // Log potential last segment before duration check
      console.log(`[transcriptionService] Potential last segment: "${segmentText}", Duration: ${segmentDuration.toFixed(3)}s`);

      if (segmentDuration >= 0.5) {
          segments.push({ start: currentSegmentStart, end: segmentEnd, text: segmentText });
      } else {
          // Log discarded last segment
          console.log(`[transcriptionService] DISCARDED last segment (too short): "${segmentText}", Duration: ${segmentDuration.toFixed(3)}s`);
      }
    }
  });

  // Log the final list of segments after filtering
  console.log("[transcriptionService] Final accepted segments:", JSON.stringify(segments, null, 2));

  // Format the created segments using the existing helper from openAIService
  const formattedText = formatSegmentsToText(segments);
  console.log(`[transcriptionService] Created ${segments.length} final short segments from words.`);
  return formattedText;
}
*/

// Hilfsfunktion zum Ausführen von Whisper
/*
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
    // const result = await nodewhisper(audioPath, whisperConfig); // Commented out - module not installed
    throw new Error('Local whisper transcription disabled - nodejs-whisper module not installed');
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
*/

// Updated main function to handle mode preference and accept aiWorkerPool
async function transcribeVideo(videoPath, subtitlePreference = 'manual', aiWorkerPool, language = 'de') {
  try {
    console.log(`[transcriptionService] Transkription Start - Modus: ${subtitlePreference}`);
    
    const outputDir = path.join(__dirname, '../../../uploads/transcriptions');
    await fs.mkdir(outputDir, { recursive: true });
    const audioPath = path.join(outputDir, `audio_${Date.now()}.mp3`);
    
    // Extrahiere Audio
    await extractAudio(videoPath, audioPath);
    
    // Try to start background video compression right after audio extraction
    // Extract uploadId from video path (assuming format: .../uploads/{uploadId})
    const uploadId = path.basename(path.dirname(videoPath));
    try {
      console.log(`[transcriptionService] Attempting background compression for uploadId: ${uploadId}`);
      startBackgroundCompression(videoPath, uploadId);
      console.log(`[transcriptionService] Background compression started successfully for: ${uploadId}`);
    } catch (compressionError) {
      console.warn(`[transcriptionService] Background compression failed for ${uploadId}, continuing with transcription:`, compressionError.message);
      // Continue with transcription even if compression fails
    }
    
    let finalTranscription = null;
    
    // UNUSED: Short subtitle mode commented out - only manual mode is used
    /*
    if (subtitlePreference === 'short') {
        console.log("[transcriptionService] Requesting word timestamps from OpenAI");
        const transcriptionResult = await transcribeWithOpenAI(audioPath, true);
        
        if (!transcriptionResult || typeof transcriptionResult.text !== 'string') {
            throw new Error('Invalid transcription data received from OpenAI');
        }
        
        console.log(`[transcriptionService] OpenAI Wörter: ${transcriptionResult.words?.length || 0}, Text: ${transcriptionResult.text.length} chars`);
        
        // Use Claude service to generate short segments from raw text
        finalTranscription = await generateShortSubtitlesViaAI(transcriptionResult.text, transcriptionResult.words, aiWorkerPool);

    } else
    */
    if (subtitlePreference === 'manual') {
        console.log("[transcriptionService] Requesting word timestamps for manual processing");
        const transcriptionResult = await transcribeWithProvider(audioPath, true);

        if (!transcriptionResult || typeof transcriptionResult.text !== 'string') {
            throw new Error('Invalid transcription data received from provider');
        }

        console.log(`[transcriptionService] Provider Wörter: ${transcriptionResult.words?.length || 0}, Text: ${transcriptionResult.text.length} chars`);

        // Use manual service to generate 2-second intelligent segments
        finalTranscription = await generateManualSubtitles(transcriptionResult.text, transcriptionResult.words);

    } else if (subtitlePreference === 'word') {
        console.log("[transcriptionService] Requesting word timestamps for word highlight processing");
        const transcriptionResult = await transcribeWithProvider(audioPath, true);

        if (!transcriptionResult || typeof transcriptionResult.text !== 'string') {
            throw new Error('Invalid transcription data received from provider');
        }

        console.log(`[transcriptionService] Provider Wörter: ${transcriptionResult.words?.length || 0}, Text: ${transcriptionResult.text.length} chars`);

        // Use word highlight service to generate individual word segments
        finalTranscription = await generateWordHighlightSubtitles(transcriptionResult.text, transcriptionResult.words);

    } else {
        // UNUSED: Standard subtitle mode commented out - only manual mode is used
        /*
        console.log("[transcriptionService] Requesting standard segments from OpenAI");
        const transcriptionResult = await transcribeWithOpenAI(audioPath, false);
        if (!transcriptionResult || typeof transcriptionResult.text !== 'string') {
            throw new Error('Invalid segment data received from OpenAI');
        }
        finalTranscription = transcriptionResult.text;
        */
        
        // Fallback to manual mode if unknown mode provided
        console.log(`[transcriptionService] Unknown mode '${subtitlePreference}', using manual mode as fallback. Supported modes: 'manual', 'word'`);
        const transcriptionResult = await transcribeWithProvider(audioPath, true);

        if (!transcriptionResult || typeof transcriptionResult.text !== 'string') {
            throw new Error('Invalid transcription data received from provider');
        }

        console.log(`[transcriptionService] Provider Wörter: ${transcriptionResult.words?.length || 0}, Text: ${transcriptionResult.text.length} chars`);

        // Use manual service to generate 2-second intelligent segments
        finalTranscription = await generateManualSubtitles(transcriptionResult.text, transcriptionResult.words);
    }
    
    // Cleanup
    try {
      await fs.unlink(audioPath);
    } catch (err) {
      console.warn('Audio cleanup failed:', err.message);
    }

    if (!finalTranscription) {
      throw new Error('Keine Transkription vom Provider erhalten oder verarbeitet');
    }

    // Log segment timing details for debugging
    const segments = finalTranscription.split('\n\n');
    console.log(`[transcriptionService] Finale Segmente: ${segments.length}`);
    
    // Log first 3 segments for timing analysis
    segments.slice(0, 3).forEach((segment, index) => {
      const lines = segment.split('\n');
      if (lines.length >= 2) {
        console.log(`[transcriptionService] Segment ${index}: ${lines[0]} | Text: "${lines[1].substring(0, 30)}..."`);
      }
    });

    return finalTranscription;
  } catch (error) {
    console.error(`[transcriptionService] Fehler (Modus: ${subtitlePreference}):`, error.message);
    throw error;
  }
}

module.exports = {
  transcribeVideo
}; 