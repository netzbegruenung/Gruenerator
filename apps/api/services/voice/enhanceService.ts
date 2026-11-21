import { createLogger } from '../../utils/logger.js';

import { kugelaudioApiKey, kugelaudioBaseUrl } from './kugelaudioConfig.js';

const log = createLogger('audio-enhance');

export type AudioEnhanceErrorCode =
  'too_long' | 'no_audio' | 'unavailable' | 'rate_limited' | 'invalid_input';

export class AudioEnhanceError extends Error {
  constructor(
    readonly code: AudioEnhanceErrorCode,
    /** HTTP status of the provider; null for errors detected locally. */
    readonly status: number | null,
    message: string
  ) {
    super(message);
    this.name = 'AudioEnhanceError';
  }
}

function codeForStatus(status: number): AudioEnhanceErrorCode {
  if (status === 429) return 'rate_limited';
  if (status === 400) return 'invalid_input';
  // 402 (credits/free period) and 403 look the same to the person: not available.
  return 'unavailable';
}

/** Removes background noise from a mono WAV; returns the enhanced WAV bytes. */
export async function enhanceSpeech(
  wav: Buffer,
  options: { signal?: AbortSignal } = {}
): Promise<Buffer> {
  const form = new FormData();
  form.append('model', 'clarity-1');
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'input.wav');

  const response = await fetch(`${kugelaudioBaseUrl()}/v1/audio/enhance`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kugelaudioApiKey('Ton verbessern')}`,
      // A full queue should come back fast as 503 instead of holding the request.
      'X-Queue-Timeout': '20',
    },
    body: form,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    let errorCode: string | null = null;
    let detail = '';
    try {
      const body = (await response.json()) as { error?: string; error_code?: string };
      errorCode = body.error_code ?? null;
      detail = body.error ?? '';
    } catch {
      // non-JSON error body
    }
    log.error('KugelAudio enhance failed', {
      status: response.status,
      errorCode,
      requestId: response.headers.get('x-request-id'),
    });
    throw new AudioEnhanceError(
      codeForStatus(response.status),
      response.status,
      detail || `KugelAudio enhance failed with ${response.status}`
    );
  }

  return Buffer.from(await response.arrayBuffer());
}
