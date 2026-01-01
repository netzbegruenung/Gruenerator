import fs from 'fs';
import https from 'https';
import FormData from 'form-data';
import { createLogger } from '../../../utils/logger.js';
import redisClient from '../../../utils/redisClient.js';

const log = createLogger('gladia');

const GLADIA_API_KEY = process.env.GLADIA_API_KEY;

const ENABLE_ZERO_DATA_RETENTION = true;

if (!GLADIA_API_KEY) {
  log.warn('Gladia API key not found in environment variables');
}

async function uploadAudioFile(filePath) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('audio', fs.createReadStream(filePath));

    const options = {
      hostname: 'api.gladia.io',
      port: 443,
      path: '/v2/upload',
      method: 'POST',
      headers: {
        'x-gladia-key': GLADIA_API_KEY,
        ...form.getHeaders()
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const response = JSON.parse(data);
            log.debug('Audio uploaded successfully');
            resolve(response.audio_url);
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

async function submitTranscriptionRequest(audioUrl) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      audio_url: audioUrl,
      language_config: {
        languages: ['de'],
        code_switching: false
      },
      diarization: false,
      subtitles: false,
      punctuation_enhanced: true
    });

    const options = {
      hostname: 'api.gladia.io',
      port: 443,
      path: '/v2/pre-recorded',
      method: 'POST',
      headers: {
        'x-gladia-key': GLADIA_API_KEY,
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
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const response = JSON.parse(data);
            log.debug(`Transcription submitted with ID: ${response.id}`);
            resolve({
              id: response.id,
              resultUrl: response.result_url
            });
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

async function getTranscriptionResult(resultUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(resultUrl);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'GET',
      headers: {
        'x-gladia-key': GLADIA_API_KEY
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
            reject(new Error(`Failed to parse result response: ${error.message}`));
          }
        } else {
          reject(new Error(`Get result failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Get result request failed: ${error.message}`));
    });

    req.end();
  });
}

async function pollForCompletion(resultUrl, transcriptId, uploadId = null) {
  const maxAttempts = 60;
  let attempt = 0;
  let baseDelay = 2000;

  while (attempt < maxAttempts) {
    if (uploadId) {
      try {
        const cancelled = await redisClient.get(`cancel:${uploadId}`);
        if (cancelled) {
          log.info(`Transcription cancelled by user: ${uploadId}`);
          await deleteTranscript(transcriptId);
          throw new Error('CANCELLED');
        }
      } catch (cancelCheckError) {
        if (cancelCheckError.message === 'CANCELLED') throw cancelCheckError;
        log.warn(`Cancellation check failed: ${cancelCheckError.message}`);
      }
    }

    try {
      const result = await getTranscriptionResult(resultUrl);

      if (result.status === 'done') {
        log.debug(`Transcription completed after ${attempt + 1} attempts`);
        return result;
      } else if (result.status === 'error') {
        throw new Error(`Transcription failed: ${result.error_message || 'Unknown error'}`);
      } else if (result.status === 'processing' || result.status === 'queued') {
        const delay = Math.min(baseDelay * Math.pow(1.5, attempt), 30000);
        log.debug(`Transcription ${result.status}, waiting ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);

        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      } else {
        throw new Error(`Unknown transcription status: ${result.status}`);
      }
    } catch (error) {
      if (error.message === 'CANCELLED') throw error;
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

async function deleteTranscript(transcriptId) {
  if (!ENABLE_ZERO_DATA_RETENTION) {
    log.debug(`ZDR disabled, skipping deletion of transcript: ${transcriptId}`);
    return true;
  }

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.gladia.io',
      port: 443,
      path: `/v2/pre-recorded/${transcriptId}`,
      method: 'DELETE',
      headers: {
        'x-gladia-key': GLADIA_API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 202 || res.statusCode === 204) {
          log.debug(`ZDR: Successfully deleted transcript ${transcriptId}`);
          resolve(true);
        } else {
          log.warn(`ZDR: Failed to delete transcript ${transcriptId}, status: ${res.statusCode}`);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      log.warn(`ZDR: Delete request failed for transcript ${transcriptId}: ${error.message}`);
      resolve(false);
    });

    req.setTimeout(10000, () => {
      log.warn(`ZDR: Delete request timeout for transcript ${transcriptId}`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

function transformToOpenAIFormat(gladiaResponse, requestWordTimestamps) {
  if (!gladiaResponse?.result?.transcription?.full_transcript) {
    throw new Error('Invalid Gladia response: missing transcription');
  }

  const transcription = gladiaResponse.result.transcription;
  const result = {
    text: transcription.full_transcript
  };

  if (requestWordTimestamps) {
    const words = [];

    if (Array.isArray(transcription.utterances)) {
      for (const utterance of transcription.utterances) {
        if (Array.isArray(utterance.words)) {
          for (const word of utterance.words) {
            words.push({
              word: word.word.trim(),
              start: word.start,
              end: word.end
            });
          }
        }
      }
    }

    if (words.length === 0) {
      throw new Error('Invalid Gladia response: missing words in utterances');
    }

    result.words = words;
    log.debug(`Transformed ${result.words.length} word timestamps from Gladia format`);
  }

  return result;
}

async function transcribeWithGladia(filePath, requestWordTimestamps = false, uploadId = null) {
  let transcriptId = null;

  try {
    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    log.debug(`Starting transcription (${fileSizeMB} MB)${uploadId ? ` for upload ${uploadId}` : ''}`);

    const audioUrl = await uploadAudioFile(filePath);

    const { id, resultUrl } = await submitTranscriptionRequest(audioUrl);
    transcriptId = id;

    const transcriptData = await pollForCompletion(resultUrl, transcriptId, uploadId);

    const result = transformToOpenAIFormat(transcriptData, requestWordTimestamps);

    const deletionSuccess = await deleteTranscript(transcriptId);
    if (!deletionSuccess) {
      log.warn(`ZDR: Failed to delete transcript ${transcriptId}, but continuing with result`);
    }

    log.info(`Transcription completed: ${result.text.length} chars, ${result.words?.length || 0} words`);

    return result;

  } catch (error) {
    log.error(`Gladia transcription error: ${error.message}`);

    if (transcriptId) {
      log.debug('Attempting ZDR cleanup after error...');
      await deleteTranscript(transcriptId);
    }

    throw error;
  }
}

async function checkServiceHealth() {
  if (!GLADIA_API_KEY) {
    log.warn('API key not configured');
    return false;
  }

  try {
    return await new Promise((resolve) => {
      const options = {
        hostname: 'api.gladia.io',
        port: 443,
        path: '/v2/pre-recorded',
        method: 'GET',
        headers: {
          'x-gladia-key': GLADIA_API_KEY
        },
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        resolve(res.statusCode === 200 || res.statusCode === 401);
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
  } catch {
    return false;
  }
}

export { transcribeWithGladia, checkServiceHealth, uploadAudioFile, submitTranscriptionRequest, pollForCompletion, getTranscriptionResult, deleteTranscript, transformToOpenAIFormat };