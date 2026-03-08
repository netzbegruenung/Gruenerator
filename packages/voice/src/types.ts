export type VoiceAgentPhase =
  | 'idle'
  | 'ready'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'speaking';

export interface VoiceAgentState {
  phase: VoiceAgentPhase;
  isActive: boolean;
  transcript: TranscriptEntry[];
  streamingText: string;
  threadId: string | null;
  error: string | null;
}

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface AudioPlaybackAdapter {
  enqueue(pcmBase64: string, sampleRate: number): void;
  stop(): void;
  isPlaying(): boolean;
  onPlaybackEnd: (() => void) | null;
}

export interface STTResult {
  success: boolean;
  text?: string;
  error?: string;
}

export interface TTSChunk {
  audio: string;
  index: number;
  sampleRate: number;
}

export interface TTSDoneEvent {
  chunks: number;
  durationMs: number;
  generationMs: number;
}

export interface VoiceAgentConfig {
  apiBaseUrl: string;
  fetchFn?: typeof fetch;
  ttsVoiceId?: number;
  ttsCfgScale?: number;
}
