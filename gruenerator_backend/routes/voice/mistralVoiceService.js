const mistralClient = require('../../workers/mistralClient');
const fs = require('fs').promises;
const path = require('path');

/**
 * Mistral Voxtral transcription service
 * Supports both file uploads and URLs
 */
class MistralVoiceService {
  /**
   * Transcribe audio from file buffer
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} filename - Original filename
   * @param {Object} options - Transcription options
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeFromBuffer(audioBuffer, filename, options = {}) {
    try {
      const { language, timestamp_granularities } = options;

      console.log('[Mistral Voice] Starting transcription with options:', { language, timestamp_granularities, filename });

      const transcriptionResponse = await mistralClient.audio.transcriptions.complete({
        model: "voxtral-mini-latest",
        file: {
          fileName: filename,
          content: audioBuffer
        },
        language: language || undefined,
        timestamp_granularities: timestamp_granularities || undefined
      });

      console.log('[Mistral Voice] Transcription response received:', transcriptionResponse);
      return this._formatResponse(transcriptionResponse, options);
    } catch (error) {
      console.error('[Mistral Voice] Transcription error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data || 'No response data',
        status: error.response?.status || 'No status'
      });
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Transcribe audio from URL
   * @param {string} audioUrl - URL to audio file
   * @param {Object} options - Transcription options
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeFromUrl(audioUrl, options = {}) {
    try {
      const { language, timestamp_granularities } = options;

      console.log('[Mistral Voice] Starting URL transcription for:', audioUrl);

      // Download the audio file first since Mistral SDK doesn't support direct URLs
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download audio from URL: ${response.status} ${response.statusText}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const filename = audioUrl.split('/').pop() || 'audio_from_url.mp3';

      console.log('[Mistral Voice] Downloaded audio file, size:', audioBuffer.length, 'bytes');

      const transcriptionResponse = await mistralClient.audio.transcriptions.complete({
        model: "voxtral-mini-latest",
        file: {
          fileName: filename,
          content: audioBuffer
        },
        language: language || undefined,
        timestamp_granularities: timestamp_granularities || undefined
      });

      console.log('[Mistral Voice] URL transcription response received:', transcriptionResponse);
      return this._formatResponse(transcriptionResponse, options);
    } catch (error) {
      console.error('[Mistral Voice] URL transcription error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data || 'No response data',
        status: error.response?.status || 'No status'
      });
      throw new Error(`URL transcription failed: ${error.message}`);
    }
  }

  /**
   * Chat with audio using Voxtral
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} filename - Original filename
   * @param {string} prompt - Text prompt to accompany audio
   * @param {Object} options - Chat options
   * @returns {Promise<string>} Chat response
   */
  async chatWithAudio(audioBuffer, filename, prompt, options = {}) {
    try {
      // Convert buffer to base64 for chat API
      const audioBase64 = audioBuffer.toString('base64');

      const chatResponse = await mistralClient.chat.complete({
        model: "voxtral-mini-latest",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: audioBase64,
              },
              {
                type: "text",
                text: prompt || "What's in this audio file?",
              },
            ],
          },
        ],
      });

      return chatResponse.choices[0].message.content;
    } catch (error) {
      console.error('[Mistral Voice] Chat error:', error);
      throw new Error(`Audio chat failed: ${error.message}`);
    }
  }

  /**
   * Format the transcription response
   * @private
   */
  _formatResponse(transcriptionResponse, options) {

    if (!transcriptionResponse) {
      throw new Error('No transcription response received');
    }

    // Handle different response formats from Mistral
    let text = transcriptionResponse.text || transcriptionResponse;
    if (typeof text !== 'string' || text.trim() === '') {
      // Empty transcription is valid - no audio or silence
      text = text || '';
    }

    const result = {
      text: text,
      hasTimestamps: false
    };

    // Check if segments with timestamps are available
    if (transcriptionResponse.segments && Array.isArray(transcriptionResponse.segments)) {
      result.segments = transcriptionResponse.segments;
      result.hasTimestamps = true;
    }

    // If removeTimestamps is requested and we have timestamps, clean them
    if (options.removeTimestamps && result.hasTimestamps) {
      result.text = this._cleanTimestamps(result.text);
      result.hasTimestamps = false;
    }

    return result;
  }

  /**
   * Clean timestamps from transcription text
   * @private
   */
  _cleanTimestamps(text) {
    if (!text) return '';

    // Remove various timestamp formats
    return text
      .replace(/\[\d{2}:\d{2}(:\d{2})?\.\d{3} --> \d{2}:\d{2}(:\d{2})?\.\d{3}\]\s*/g, '')
      .replace(/\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}\s*/g, '')
      .replace(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*/g, '')
      .replace(/\[\d{2}:\d{2}(:\d{2})?\.\d{3}\]\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get supported audio formats
   */
  getSupportedFormats() {
    return [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/m4a',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
      'audio/flac'
    ];
  }

  /**
   * Check if audio format is supported
   */
  isFormatSupported(mimetype) {
    return this.getSupportedFormats().includes(mimetype);
  }
}

module.exports = new MistralVoiceService();