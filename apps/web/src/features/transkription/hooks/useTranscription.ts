import { useCallback, useRef, useState } from 'react';

import apiClient from '../../../components/utils/apiClient';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionState {
  status: 'idle' | 'uploading' | 'transcribing' | 'done' | 'error';
  progress: number;
  text: string;
  segments: TranscriptionSegment[];
  hasTimestamps: boolean;
  error: string | null;
}

export interface TranscriptionOptions {
  diarize: boolean;
  timestamps: boolean;
  language: string;
  privacyMode?: boolean;
}

const INITIAL_STATE: TranscriptionState = {
  status: 'idle',
  progress: 0,
  text: '',
  segments: [],
  hasTimestamps: false,
  error: null,
};

async function parseSSEStream(
  response: Response,
  onDelta: (text: string) => void,
  onDone: (text: string) => void,
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop()!;

    for (const event of events) {
      if (!event.trim()) continue;
      const dataLine = event.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;

      try {
        const data = JSON.parse(dataLine.slice(6));
        if (data.type === 'text.delta') {
          onDelta(data.text);
        } else if (data.type === 'done') {
          onDone(data.text ?? '');
        } else if (data.type === 'error') {
          throw new Error(data.text ?? 'Streaming-Fehler');
        }
      } catch {
        // skip malformed events
      }
    }
  }
}

export function useTranscription() {
  const [state, setState] = useState<TranscriptionState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const transcribe = useCallback(async (file: File, options: TranscriptionOptions) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const formData = new FormData();
    formData.append('audio', file);

    const needsStandardEndpoint = options.diarize || options.timestamps || options.privacyMode;

    try {
      setState({ ...INITIAL_STATE, status: 'uploading' });

      if (needsStandardEndpoint) {
        const params = new URLSearchParams({
          language: options.language,
          ...(options.diarize && { diarize: 'true' }),
          ...(options.timestamps && { timestamps: 'true' }),
          ...(options.privacyMode && { privacyMode: 'true' }),
        });

        setState((s) => ({ ...s, status: 'transcribing', progress: 100 }));

        const response = await apiClient.post(`/voice/transcribe?${params}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          signal: controller.signal,
          timeout: options.privacyMode ? 900000 : undefined,
          onUploadProgress: (e) => {
            if (e.total) {
              setState((s) => ({ ...s, progress: Math.round((e.loaded / e.total!) * 100) }));
            }
          },
        });

        const data = response.data;
        if (!data.success) throw new Error(data.error ?? 'Transkription fehlgeschlagen');

        setState({
          status: 'done',
          progress: 100,
          text: data.text ?? '',
          segments: data.segments ?? [],
          hasTimestamps: data.hasTimestamps ?? false,
          error: null,
        });
      } else {
        setState((s) => ({ ...s, status: 'transcribing', progress: 100 }));

        const response = await fetch(`/api/voice/transcribe/stream?language=${options.language}`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${response.status}`);
        }

        let fullText = '';

        await parseSSEStream(
          response,
          (delta) => {
            fullText += delta;
            setState((s) => ({ ...s, text: fullText }));
          },
          (finalText) => {
            if (finalText) fullText = finalText;
            setState({
              status: 'done',
              progress: 100,
              text: fullText,
              segments: [],
              hasTimestamps: false,
              error: null,
            });
          },
        );

        if (state.status !== 'done') {
          setState((s) => ({ ...s, status: 'done' }));
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setState((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unbekannter Fehler',
      }));
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { state, transcribe, reset };
}
