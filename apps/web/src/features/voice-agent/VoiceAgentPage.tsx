import { useVoiceAgent, type VoiceAgentPhase } from '@gruenerator/voice';

import { Transcript } from './components/Transcript';
import { VoiceOrb } from './components/VoiceOrb';

const API_BASE_URL = window.location.origin;

const footerHints: Record<VoiceAgentPhase, string> = {
  idle: 'Klicke um zu starten',
  ready: 'Halte den Kreis gedrückt um zu sprechen',
  recording: 'Lass los wenn du fertig bist',
  transcribing: 'Wird verarbeitet...',
  thinking: 'Antwort wird generiert...',
  speaking: 'Tippe um zu unterbrechen',
};

export default function VoiceAgentPage() {
  const {
    phase,
    isActive,
    transcript,
    streamingText,
    error,
    activate,
    deactivate,
    startRecording,
    stopRecording,
    interrupt,
  } = useVoiceAgent({
    apiBaseUrl: API_BASE_URL,
  });

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Orb area */}
      <div className="flex flex-shrink-0 items-center justify-center pt-xl pb-lg">
        <VoiceOrb
          phase={phase}
          isActive={isActive}
          onActivate={activate}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onInterrupt={interrupt}
        />
      </div>

      {/* Deactivate button */}
      {isActive && (
        <div className="flex justify-center pb-md">
          <button
            type="button"
            onClick={deactivate}
            className="text-xs text-grey-400 hover:text-grey-600 dark:text-grey-500 dark:hover:text-grey-300 transition-colors"
          >
            Beenden
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mx-md rounded-md bg-red-100 dark:bg-red-900/30 px-md py-sm text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Transcript */}
      <Transcript entries={transcript} streamingText={streamingText} />

      {/* Footer hint */}
      <div className="flex-shrink-0 px-md py-sm text-center text-xs text-grey-400 dark:text-grey-500">
        {footerHints[phase]}
      </div>
    </div>
  );
}
