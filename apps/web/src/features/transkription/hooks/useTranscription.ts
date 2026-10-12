import {
  type TranscribeStreamEvent,
  type TranscriptionSegment,
  type VoiceErrorResponse,
} from '@gruenerator/contracts';
import { useCallback, useRef, useState } from 'react';
import * as tus from 'tus-js-client';

import apiClient from '../../../components/utils/apiClient';
import { useDesktopNotify } from '../../../utils/desktopNotification';
import { platformFetch } from '../../../utils/platformFetch';
import { getTusAuthOptions } from '../../../utils/tusAuth';
import { isVideoUpload, uploadMediaType } from '../utils/mediaType';

// Re-exported so feature code keeps a local import path while the shape stays
// owned by the contract schema.
export type { TranscriptionSegment };

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
  /**
   * UI state of the Datenschutz-Modus hint only. It used to switch to a
   * non-streaming endpoint that runs the identical provider chain but sends
   * nothing until the end, so nginx cut long recordings off after 300s.
   */
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

const TUS_UPLOAD_ENDPOINT = `${apiClient.defaults.baseURL}/audio/upload`;

const CONNECTION_LOST_MESSAGE =
  'Die Verbindung zum Server ist während der Verarbeitung abgebrochen. Bitte versuche es erneut. Bei sehr langen Aufnahmen hilft es, sie vorher in kürzere Teile zu schneiden.';

/** Messages a person can act on, keyed by the HTTP status that caused them. */
function describeHttpFailure(status: number, step: 'upload' | 'start'): string {
  if (status === 401 || status === 403) {
    return 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an und versuche es erneut.';
  }
  if (status === 413) {
    return 'Die Datei ist zu groß für den Server. Wandle Audiodateien vorher in MP3 oder M4A um.';
  }
  if (status === 429) {
    return 'Du hast gerade zu viele Transkriptionen gestartet. Bitte warte ein paar Minuten.';
  }
  return step === 'upload'
    ? `Der Server hat den Upload abgelehnt (Fehler ${status}). Bitte versuche es später erneut.`
    : `Die Transkription konnte nicht gestartet werden (Fehler ${status}). Bitte versuche es später erneut.`;
}

function describeTusFailure(err: Error): string {
  const status = err instanceof tus.DetailedError ? err.originalResponse?.getStatus() : undefined;
  if (status) return describeHttpFailure(status, 'upload');
  return 'Der Upload ist abgebrochen, vermutlich wegen der Internetverbindung. Bitte prüfe die Verbindung und versuche es erneut.';
}

interface SSECallbacks {
  onExtractionStart: () => void;
  onExtractionProgress: (percent: number, timemark: string) => void;
  onExtractionComplete: () => void;
  onTranscriptionStart: () => void;
  onDelta: (text: string) => void;
  onDone: (data: {
    text: string;
    segments?: TranscriptionSegment[] | null;
    hasTimestamps?: boolean | null;
    speakerMap?: Record<string, string> | null;
  }) => void;
}

/**
 * Returns whether a `done` event actually arrived. The caller needs to know:
 * a stream that ends without one (backend crash, proxy timeout, dropped
 * connection) is a failure, not an empty success.
 */
async function parseSSEStream(response: Response, callbacks: SSECallbacks): Promise<boolean> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;

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

      // Only the JSON.parse is guarded: one malformed frame should be skipped,
      // not turned into a total failure of an otherwise healthy stream.
      let data: TranscribeStreamEvent;
      try {
        data = JSON.parse(dataLine.slice(6)) as TranscribeStreamEvent;
      } catch {
        continue;
      }

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
          sawDone = true;
          callbacks.onDone({
            text: data.text ?? '',
            segments: data.segments,
            hasTimestamps: data.hasTimestamps,
            speakerMap: data.speakerMap,
          });
          break;
        case 'error':
          throw new Error(data.text ?? 'Streaming-Fehler');
        case 'heartbeat':
          break;
      }
    }
  }

  return sawDone;
}

/** `/api/audio/upload` is behind requireAuth — see `getTusAuthOptions`. */
async function tusUpload(
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal
): Promise<string> {
  const authOptions = await getTusAuthOptions();

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: TUS_UPLOAD_ENDPOINT,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: 5 * 1024 * 1024,
      metadata: { filename: file.name, filetype: uploadMediaType(file) },
      ...authOptions,
      onError: (err) => reject(new Error(describeTusFailure(err))),
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => {
        const uploadId = upload.url?.split('/').pop() ?? '';
        resolve(uploadId);
      },
    });

    signal.addEventListener('abort', () => {
      void upload.abort();
      reject(new DOMException('Upload aborted', 'AbortError'));
    });

    upload.start();
  });
}

export function useTranscription() {
  const notifyDesktop = useDesktopNotify();
  const [state, setState] = useState<TranscriptionState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const transcribe = useCallback(
    async (file: File, options: TranscriptionOptions): Promise<string | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const isVideo = isVideoUpload(file);

      try {
        setState({ ...INITIAL_STATE, status: 'uploading' });

        const uploadId = await tusUpload(
          file,
          (percent) => setState((s) => ({ ...s, progress: percent })),
          controller.signal
        );

        setState((s) => ({
          ...s,
          status: isVideo ? 'extracting' : 'transcribing',
          progress: 0,
        }));

        const response = await platformFetch('/api/voice/transcribe-upload/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId,
            language: options.language,
            diarize: options.diarize,
            timestamps: options.timestamps,
          }),
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = (await response.json().catch(() => ({}))) as Partial<VoiceErrorResponse>;
          throw new Error(err.error ?? describeHttpFailure(response.status, 'start'));
        }

        let fullText = '';

        const sawDone = await parseSSEStream(response, {
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

        // Without this guard a stream that ended early was reported as a
        // successful, empty transcription: the full result UI over no text.
        if (!sawDone) {
          throw new Error(CONNECTION_LOST_MESSAGE);
        }
        notifyDesktop('transcription');
        return fullText;
      } catch (err) {
        if (controller.signal.aborted) return null;
        // fetch and the stream reader reject with a bare TypeError ("Failed to
        // fetch", "network error") when the connection drops.
        const message =
          err instanceof TypeError
            ? CONNECTION_LOST_MESSAGE
            : err instanceof Error
              ? err.message
              : 'Unbekannter Fehler';
        setState((s) => ({ ...s, status: 'error', error: message }));
        return null;
      }
    },
    [notifyDesktop]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  /** Put a previously persisted result back on screen without re-transcribing. */
  const restore = useCallback(
    (value: Pick<TranscriptionState, 'text' | 'segments' | 'hasTimestamps' | 'speakerMap'>) => {
      abortRef.current?.abort();
      setState({ ...INITIAL_STATE, ...value, status: 'done', progress: 100 });
    },
    []
  );

  return { state, transcribe, reset, restore };
}
