const fs = require('fs');
const https = require('https');
const FormData = require('form-data');
const { createLogger } = require('../../../utils/logger.js');

const log = createLogger('assemblyAI');

// AssemblyAI EU endpoint configuration
const ASSEMBLYAI_EU_BASE_URL = 'https://api.eu.assemblyai.com/v2';
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// Zero Data Retention configuration (hardcoded as requested)
const ENABLE_ZERO_DATA_RETENTION = true;

if (!ASSEMBLYAI_API_KEY) {
  log.warn('AssemblyAI API key not found in environment variables');
}

/**
 * Upload audio file to AssemblyAI EU servers
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<string>} - Upload URL
 */
async function uploadAudioFile(filePath) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const options = {
      hostname: 'api.eu.assemblyai.com',
      port: 443,
      path: '/v2/upload',
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY,
        ...form.getHeaders()
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            log.debug(`Audio uploaded successfully`);
            resolve(response.upload_url);
          } catch (error) {
            reject(new Error(`Failed to parse upload response: ${error.message}`));
          }
        } else {
          reject(new Error(`Upload failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Upload request failed: ${error.message}`));
    });

    form.pipe(req);
  });
}

/**
 * Submit transcription request to AssemblyAI
 * @param {string} audioUrl - URL of uploaded audio
 * @param {boolean} requestWordTimestamps - Whether to request word-level timestamps
 * @returns {Promise<string>} - Transcript ID
 */
async function submitTranscriptionRequest(audioUrl, requestWordTimestamps = false) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      audio_url: audioUrl,
      language_code: 'de', // German language
      language_detection: false, // We specify German explicitly
      punctuate: true,
      format_text: true,
      speech_threshold: 0.5, // Higher threshold to reduce truncated words

      // Quality settings
      filter_profanity: false,
      redact_pii: false,
      disfluencies: false, // Don't transcribe "umm", "ähm" etc.
      entity_detection: true // Help identify proper nouns and named entities
    });

    const options = {
      hostname: 'api.eu.assemblyai.com',
      port: 443,
      path: '/v2/transcript',
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            log.debug(`Transcription submitted with ID: ${response.id}`);
            resolve(response.id);
          } catch (error) {
            reject(new Error(`Failed to parse transcription response: ${error.message}`));
          }
        } else {
          reject(new Error(`Transcription request failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Transcription request failed: ${error.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Poll for transcription completion with exponential backoff
 * @param {string} transcriptId - The transcript ID
 * @returns {Promise<Object>} - Complete transcript data
 */
async function pollForCompletion(transcriptId) {
  const maxAttempts = 60; // 10 minutes max with exponential backoff
  let attempt = 0;
  let baseDelay = 2000; // Start with 2 second delay

  while (attempt < maxAttempts) {
    try {
      const transcriptData = await getTranscript(transcriptId);

      if (transcriptData.status === 'completed') {
        log.debug(`Transcription completed after ${attempt + 1} attempts`);
        return transcriptData;
      } else if (transcriptData.status === 'error') {
        throw new Error(`Transcription failed: ${transcriptData.error || 'Unknown error'}`);
      } else if (transcriptData.status === 'processing' || transcriptData.status === 'queued') {
        // Calculate exponential backoff delay
        const delay = Math.min(baseDelay * Math.pow(1.5, attempt), 30000); // Max 30 seconds
        log.debug(`Transcription ${transcriptData.status}, waiting ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);

        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      } else {
        throw new Error(`Unknown transcription status: ${transcriptData.status}`);
      }
    } catch (error) {
      if (attempt >= maxAttempts - 1) {
        throw error;
      }
      log.warn(`Polling attempt ${attempt + 1} failed, retrying: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, baseDelay));
      attempt++;
    }
  }

  throw new Error(`Transcription polling timeout after ${maxAttempts} attempts`);
}

/**
 * Get transcript data from AssemblyAI
 * @param {string} transcriptId - The transcript ID
 * @returns {Promise<Object>} - Transcript data
 */
async function getTranscript(transcriptId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.eu.assemblyai.com',
      port: 443,
      path: `/v2/transcript/${transcriptId}`,
      method: 'GET',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse transcript response: ${error.message}`));
          }
        } else {
          reject(new Error(`Get transcript failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Get transcript request failed: ${error.message}`));
    });

    req.end();
  });
}

/**
 * Delete transcript from AssemblyAI servers for Zero Data Retention (ZDR)
 * @param {string} transcriptId - The transcript ID to delete
 * @returns {Promise<boolean>} - True if deletion successful, false otherwise
 */
async function deleteTranscript(transcriptId) {
  if (!ENABLE_ZERO_DATA_RETENTION) {
    log.debug(`ZDR disabled, skipping deletion of transcript: ${transcriptId}`);
    return true;
  }

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.eu.assemblyai.com',
      port: 443,
      path: `/v2/transcript/${transcriptId}`,
      method: 'DELETE',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          log.debug(`ZDR: Successfully deleted transcript ${transcriptId}`);
          resolve(true);
        } else {
          log.warn(`ZDR: Failed to delete transcript ${transcriptId}, status: ${res.statusCode}`);
          resolve(false); // Don't fail the entire process if deletion fails
        }
      });
    });

    req.on('error', (error) => {
      log.warn(`ZDR: Delete request failed for transcript ${transcriptId}: ${error.message}`);
      resolve(false); // Don't fail the entire process if deletion fails
    });

    req.setTimeout(10000, () => {
      log.warn(`ZDR: Delete request timeout for transcript ${transcriptId}`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Transform AssemblyAI response to match OpenAI format
 * @param {Object} assemblyAIResponse - Raw response from AssemblyAI
 * @param {boolean} requestWordTimestamps - Whether word timestamps were requested
 * @returns {Object} - Formatted response matching OpenAI format
 */
function transformToOpenAIFormat(assemblyAIResponse, requestWordTimestamps) {
  if (!assemblyAIResponse || !assemblyAIResponse.text) {
    throw new Error('Invalid AssemblyAI response: missing text');
  }

  const result = {
    text: assemblyAIResponse.text
  };

  if (requestWordTimestamps) {
    if (!Array.isArray(assemblyAIResponse.words)) {
      throw new Error('Invalid AssemblyAI response: missing words array');
    }

    // Transform AssemblyAI word format to OpenAI format
    // AssemblyAI: {text: string, start: number (ms), end: number (ms), confidence: number}
    // OpenAI: {word: string, start: number (s), end: number (s)}
    result.words = assemblyAIResponse.words.map(word => ({
      word: word.text.trim(),
      start: word.start / 1000, // Convert milliseconds to seconds
      end: word.end / 1000       // Convert milliseconds to seconds
    }));

    log.debug(`Transformed ${result.words.length} word timestamps from AssemblyAI format`);
  }

  return result;
}

/**
 * Main transcription function compatible with OpenAI service interface
 * @param {string} filePath - Path to audio file
 * @param {boolean} requestWordTimestamps - Whether to request word-level timestamps
 * @returns {Promise<Object>} - Transcription result in OpenAI-compatible format
 */
async function transcribeWithAssemblyAI(filePath, requestWordTimestamps = false) {
  let transcriptId = null; // Declare here for cleanup in catch block

  try {
    // Log the file size for monitoring
    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    log.debug(`Starting transcription (${fileSizeMB} MB)`);

    // Step 1: Upload audio file
    const audioUrl = await uploadAudioFile(filePath);

    // Step 2: Submit transcription request
    transcriptId = await submitTranscriptionRequest(audioUrl, requestWordTimestamps);

    // Step 3: Poll for completion
    const transcriptData = await pollForCompletion(transcriptId);

    // Step 4: Transform to OpenAI-compatible format
    const result = transformToOpenAIFormat(transcriptData, requestWordTimestamps);

    // Step 5: Delete transcript for Zero Data Retention (ZDR)
    const deletionSuccess = await deleteTranscript(transcriptId);
    if (!deletionSuccess) {
      log.warn(`ZDR: Failed to delete transcript ${transcriptId}, but continuing with result`);
    }

    log.info(`Transcription completed: ${result.text.length} chars, ${result.words?.length || 0} words`);

    return result;

  } catch (error) {
    log.error(`AssemblyAI transcription error: ${error.message}`);

    // Try to clean up transcript if it was created but failed during processing
    if (transcriptId) {
      log.debug('Attempting ZDR cleanup after error...');
      await deleteTranscript(transcriptId);
    }

    throw error;
  }
}

/**
 * Utility function to check AssemblyAI service health
 * @returns {Promise<boolean>} - True if service is available
 */
async function checkServiceHealth() {
  if (!ASSEMBLYAI_API_KEY) {
    log.warn('API key not configured');
    return false;
  }

  try {
    // Simple API check - this endpoint should always be available
    await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.eu.assemblyai.com',
        port: 443,
        path: '/v2/transcript', // This will return 400 but confirms API is reachable
        method: 'GET',
        headers: {
          'Authorization': ASSEMBLYAI_API_KEY
        },
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        // We expect 400 or 401, which means API is reachable
        resolve(res.statusCode === 400 || res.statusCode === 401);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });

    return true;
  } catch {
    return false;
  }
}

module.exports = {
  transcribeWithAssemblyAI,
  checkServiceHealth,

  // Export utility functions for testing
  uploadAudioFile,
  submitTranscriptionRequest,
  pollForCompletion,
  getTranscript,
  deleteTranscript,
  transformToOpenAIFormat
};