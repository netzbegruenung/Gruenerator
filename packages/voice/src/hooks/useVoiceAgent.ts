/**
 * Main voice agent orchestration hook.
 *
 * Wires together: Push-to-Talk → STT → ChatGraph SSE → sentence splitter → TTS SSE → audio playback.
 *
 * Flow:
 *   1. User holds button → MediaRecorder captures audio
 *   2. On release → convert to WAV, POST to /api/voice/transcribe
 *   3. POST full message history to /api/chat-graph/stream (SSE)
 *   4. Parse text_delta events, split into sentences
 *   5. Each sentence → POST /api/voice/tts/stream (SSE)
 *   6. Decode PCM16 chunks → enqueue in AudioPlayback
 *   7. On playback drain → back to ready state
 */

import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { createVoiceAgentStore, type VoiceAgentStore } from '../stores/voiceAgentStore';
import { type VoiceAgentConfig, type TranscriptEntry } from '../types';
import { useSTT } from './useSTT';
import { useTTSStream } from './useTTSStream';
import { useAudioPlayback } from './useAudioPlayback';
import { usePushToTalk } from './usePushToTalk';
import { splitSentences } from '../lib/sentenceSplitter';

export function useVoiceAgent(config: VoiceAgentConfig) {
  const storeRef = useRef(createVoiceAgentStore());
  const store = storeRef.current;

  const phase = useStore(store, (s) => s.phase);
  const isActive = useStore(store, (s) => s.isActive);
  const transcript = useStore(store, (s) => s.transcript);
  const streamingText = useStore(store, (s) => s.streamingText);
  const threadId = useStore(store, (s) => s.threadId);
  const error = useStore(store, (s) => s.error);

  const { transcribe, abort: abortSTT } = useSTT(config);
  const { streamSentence, abort: abortTTS } = useTTSStream(config);
  const {
    enqueue,
    stop: stopAudio,
    signalDone,
    setOnPlaybackEnd,
    ensureContext,
  } = useAudioPlayback();

  const fetchFn = config.fetchFn ?? fetch;
  const chatAbortRef = useRef<AbortController | null>(null);
  const sentenceBufferRef = useRef('');
  const firstChunkFiredRef = useRef(false);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsActiveRef = useRef(false);

  // Wire playback end → transition back to ready
  useEffect(() => {
    setOnPlaybackEnd(() => {
      const state = store.getState();
      if (state.phase === 'speaking') {
        state.finalizeAssistantTurn();
        state.onPlaybackEnd();
      }
    });
  }, [setOnPlaybackEnd, store]);

  // Process TTS queue sequentially
  const processTTSQueue = useCallback(async () => {
    if (ttsActiveRef.current) return;
    ttsActiveRef.current = true;

    while (ttsQueueRef.current.length > 0) {
      const sentence = ttsQueueRef.current.shift()!;
      const state = store.getState();
      if (state.phase !== 'thinking' && state.phase !== 'speaking') break;

      await streamSentence(sentence, {
        onChunk: (chunk) => {
          const currentState = store.getState();
          if (currentState.phase !== 'thinking' && currentState.phase !== 'speaking') return;

          if (!firstChunkFiredRef.current) {
            firstChunkFiredRef.current = true;
            store.getState().onFirstTTSChunk();
          }
          enqueue(chunk.audio, chunk.sampleRate);
        },
        onDone: () => {},
        onError: (err) => {
          console.error('[VoiceAgent] TTS error:', err);
        },
      });
    }

    ttsActiveRef.current = false;
  }, [streamSentence, enqueue, store]);

  // Queue a sentence for TTS
  const queueSentenceForTTS = useCallback(
    (sentence: string) => {
      ttsQueueRef.current.push(sentence);
      processTTSQueue();
    },
    [processTTSQueue]
  );

  // Stream ChatGraph response and pipeline sentences to TTS
  const streamChatResponse = useCallback(
    async (messages: TranscriptEntry[], currentThreadId: string | null) => {
      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;

      sentenceBufferRef.current = '';
      firstChunkFiredRef.current = false;
      ttsQueueRef.current = [];

      const chatMessages = messages.map((m) => ({
        role: m.role,
        content: m.text,
      }));

      try {
        const response = await fetchFn(`${config.apiBaseUrl}/api/chat-graph/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatMessages,
            threadId: currentThreadId,
          }),
          signal: controller.signal,
          credentials: 'include',
        });

        if (!response.ok) {
          store.getState().setError(`Chat request failed: ${response.status}`);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          store.getState().setError('No response body');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            let data: Record<string, unknown>;
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (data['threadId'] && !store.getState().threadId) {
              store.getState().setThreadId(data['threadId'] as string);
            }

            if (data['text'] && typeof data['text'] === 'string') {
              store.getState().appendStreamingText(data['text']);
              sentenceBufferRef.current += data['text'];

              const { complete, remainder } = splitSentences(sentenceBufferRef.current);
              sentenceBufferRef.current = remainder;

              for (const sentence of complete) {
                queueSentenceForTTS(sentence);
              }
            }
          }
        }

        const remaining = sentenceBufferRef.current.trim();
        if (remaining) {
          queueSentenceForTTS(remaining);
          sentenceBufferRef.current = '';
        }

        const waitForTTSDrain = () => {
          if (ttsQueueRef.current.length === 0 && !ttsActiveRef.current) {
            signalDone();
          } else {
            setTimeout(waitForTTSDrain, 50);
          }
        };
        waitForTTSDrain();
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        store.getState().setError((err as Error).message);
      }
    },
    [config.apiBaseUrl, fetchFn, store, queueSentenceForTTS, signalDone]
  );

  // Handle recording complete from push-to-talk
  const handleRecordingComplete = useCallback(
    async (audio: Float32Array, sampleRate: number) => {
      const state = store.getState();
      if (!state.isActive || state.phase !== 'transcribing') return;

      const result = await transcribe(audio, sampleRate);
      if (!result.success || !result.text?.trim()) {
        // Empty transcription — go back to ready
        store.setState({ phase: 'ready' });
        return;
      }

      store.getState().onSTTDone(result.text);

      const updatedState = store.getState();
      streamChatResponse(updatedState.transcript, updatedState.threadId);
    },
    [store, transcribe, streamChatResponse]
  );

  const {
    startRecording: pttStart,
    stopRecording: pttStop,
    isRecording,
  } = usePushToTalk({
    onRecordingComplete: handleRecordingComplete,
  });

  // Interrupt: stop everything and return to ready
  const interrupt = useCallback(() => {
    chatAbortRef.current?.abort();
    abortTTS();
    stopAudio();
    ttsQueueRef.current = [];
    ttsActiveRef.current = false;
    store.getState().finalizeAssistantTurn();
    store.getState().onInterrupt();
  }, [store, abortTTS, stopAudio]);

  // Public API
  const activate = useCallback(() => {
    ensureContext();
    store.getState().activate();
  }, [store, ensureContext]);

  const deactivate = useCallback(() => {
    chatAbortRef.current?.abort();
    abortSTT();
    abortTTS();
    stopAudio();
    ttsQueueRef.current = [];
    ttsActiveRef.current = false;
    store.getState().deactivate();
  }, [store, abortSTT, abortTTS, stopAudio]);

  const startRecording = useCallback(() => {
    const state = store.getState();
    if (state.phase !== 'ready') return;
    state.startRecording();
    pttStart();
  }, [store, pttStart]);

  const stopRecording = useCallback(() => {
    const state = store.getState();
    if (state.phase !== 'recording') return;
    state.stopRecording();
    pttStop();
  }, [store, pttStop]);

  return {
    phase,
    isActive,
    isRecording,
    transcript,
    streamingText,
    threadId,
    error,
    activate,
    deactivate,
    startRecording,
    stopRecording,
    interrupt,
  };
}
