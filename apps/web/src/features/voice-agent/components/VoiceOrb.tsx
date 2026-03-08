import { type VoiceAgentPhase } from '@gruenerator/voice';

import { cn } from '@/utils/cn';

interface VoiceOrbProps {
  phase: VoiceAgentPhase;
  isActive: boolean;
  onActivate: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onInterrupt: () => void;
}

const phaseLabels: Record<VoiceAgentPhase, string> = {
  idle: 'Starten',
  ready: 'Halte gedrückt',
  recording: 'Aufnahme...',
  transcribing: 'Verarbeite...',
  thinking: 'Denke nach...',
  speaking: 'Spreche...',
};

export function VoiceOrb({
  phase,
  isActive,
  onActivate,
  onStartRecording,
  onStopRecording,
  onInterrupt,
}: VoiceOrbProps) {
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (phase === 'idle') {
      onActivate();
    } else if (phase === 'ready') {
      onStartRecording();
    } else if (phase === 'speaking' || phase === 'thinking') {
      onInterrupt();
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    if (phase === 'recording') {
      onStopRecording();
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    e.preventDefault();
    if (phase === 'recording') {
      onStopRecording();
    }
  };

  return (
    <div className="flex flex-col items-center gap-lg">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className={cn(
          'relative flex h-32 w-32 select-none items-center justify-center rounded-full transition-all duration-300',
          'touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          phase === 'idle' &&
            'bg-grey-200 dark:bg-grey-700 hover:bg-grey-300 dark:hover:bg-grey-600',
          phase === 'ready' && 'bg-primary-500/20',
          phase === 'recording' && 'bg-red-500/20',
          phase === 'transcribing' && 'bg-primary-500/30',
          phase === 'thinking' && 'bg-primary-500/30',
          phase === 'speaking' && 'bg-primary-500/20'
        )}
        aria-label={isActive ? 'Sprachassistent stoppen' : 'Sprachassistent starten'}
      >
        {/* Inner orb */}
        <div
          className={cn(
            'h-20 w-20 rounded-full transition-all duration-300',
            phase === 'idle' && 'bg-grey-400 dark:bg-grey-500',
            phase === 'ready' && 'bg-primary-500',
            phase === 'recording' && 'bg-red-500 animate-pulse',
            phase === 'transcribing' && 'bg-primary-600 animate-spin-slow',
            phase === 'thinking' && 'bg-primary-600 animate-spin-slow',
            phase === 'speaking' && 'bg-primary-500 animate-breathe'
          )}
        />

        {/* Pulsing ring for recording */}
        {phase === 'recording' && (
          <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-30" />
        )}
      </button>

      <span className="text-sm text-foreground font-medium">{phaseLabels[phase]}</span>
    </div>
  );
}
