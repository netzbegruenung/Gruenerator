import { useCallback, useRef, useState } from 'react';

import apiClient from '../../../components/utils/apiClient';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speakerId?: string | null;
}

export interface TranscriptionState {
  status: 'idle' | 'uploading' | 'extracting' | 'transcribing' | 'done' | 'error';
  progress: number;
  text: string;
  segments: TranscriptionSegment[];
  hasTimestamps: boolean;
  speakerMap: Record<string, string>;
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
  speakerMap: {},
  error: null,
};

interface SSECallbacks {
  onExtractionStart: () => void;
  onExtractionProgress: (percent: number, timemark: string) => void;
  onExtractionComplete: () => void;
  onTranscriptionStart: () => void;
  onDelta: (text: string) => void;
  onDone: (data: {
    text: string;
    segments?: TranscriptionSegment[];
    hasTimestamps?: boolean;
    speakerMap?: Record<string, string>;
  }) => void;
}

async function parseSSEStream(response: Response, callbacks: SSECallbacks) {
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
        switch (data.type) {
          case 'extraction_start':
            callbacks.onExtractionStart();
            break;
          case 'extraction_progress':
            callbacks.onExtractionProgress(data.percent ?? 0, data.timemark ?? '');
            break;
          case 'extraction_complete':
            callbacks.onExtractionComplete();
            break;
          case 'transcription_start':
            callbacks.onTranscriptionStart();
            break;
          case 'text.delta':
            callbacks.onDelta(data.text);
            break;
          case 'done':
            callbacks.onDone({
              text: data.text ?? '',
              segments: data.segments,
              hasTimestamps: data.hasTimestamps,
              speakerMap: data.speakerMap,
            });
            break;
          case 'error':
            throw new Error(data.text ?? 'Streaming-Fehler');
        }
      } catch (err) {
        if (err instanceof Error && err.message !== 'Streaming-Fehler') throw err;
        if (err instanceof Error) throw err;
      }
    }
  }
}

export function useTranscription() {
  const [state, setState] = useState<TranscriptionState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const transcribe = useCallback(
    async (file: File, options: TranscriptionOptions): Promise<string | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const formData = new FormData();
      formData.append('audio', file);

      const isVideo = file.type.startsWith('video/');
      const usePrivacyEndpoint = options.privacyMode && !isVideo;

      try {
        setState({ ...INITIAL_STATE, status: 'uploading' });

        if (usePrivacyEndpoint) {
          const params = new URLSearchParams({
            language: options.language,
            ...(options.diarize && { diarize: 'true' }),
            ...(options.timestamps && { timestamps: 'true' }),
            ...(options.privacyMode && { privacyMode: 'true' }),
          });

          const response = await apiClient.post(`/voice/transcribe?${params}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            signal: controller.signal,
            timeout: 900000,
            onUploadProgress: (e) => {
              if (e.total) {
                setState((s) => ({ ...s, progress: Math.round((e.loaded / e.total!) * 100) }));
              }
            },
          });

          const data = response.data;
          if (!data.success) throw new Error(data.error ?? 'Transkription fehlgeschlagen');

          const text = data.text ?? '';
          setState({
            status: 'done',
            progress: 100,
            text,
            segments: data.segments ?? [],
            hasTimestamps: data.hasTimestamps ?? false,
            speakerMap: data.speakerMap ?? {},
            error: null,
          });
          return text;
        } else {
          const params = new URLSearchParams({
            language: options.language,
            ...(options.diarize && { diarize: 'true' }),
            ...(options.timestamps && { timestamps: 'true' }),
          });

          const response = await fetch(`/api/voice/transcribe/stream?${params}`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
            signal: controller.signal,
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error ?? `HTTP ${response.status}`);
          }

          setState((s) => ({ ...s, status: isVideo ? 'extracting' : 'transcribing', progress: 0 }));

          let fullText = '';

          await parseSSEStream(response, {
            onExtractionStart: () => {
              setState((s) => ({ ...s, status: 'extracting', progress: 0 }));
            },
            onExtractionProgress: (percent) => {
              setState((s) => ({ ...s, status: 'extracting', progress: percent }));
            },
            onExtractionComplete: () => {
              setState((s) => ({ ...s, status: 'transcribing', progress: 0 }));
            },
            onTranscriptionStart: () => {
              setState((s) => ({ ...s, status: 'transcribing', progress: 0 }));
            },
            onDelta: (text) => {
              fullText += text;
              setState((s) => ({ ...s, text: fullText }));
            },
            onDone: (data) => {
              fullText = data.text || fullText;
              setState({
                status: 'done',
                progress: 100,
                text: fullText,
                segments: data.segments ?? [],
                hasTimestamps: data.hasTimestamps ?? false,
                speakerMap: data.speakerMap ?? {},
                error: null,
              });
            },
          });

          setState((s) => (s.status !== 'done' ? { ...s, status: 'done' } : s));
          return fullText;
        }
      } catch (err) {
        if (controller.signal.aborted) return null;
        setState((s) => ({
          ...s,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unbekannter Fehler',
        }));
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { state, transcribe, reset };
}
