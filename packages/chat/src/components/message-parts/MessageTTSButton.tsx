'use client';

import { memo } from 'react';
import { Volume2, Square, Loader2 } from 'lucide-react';
import { useMessageTTS, type TTSState } from '../../hooks/useMessageTTS';
import { useChatConfigStore } from '../../stores/chatConfigStore';

interface MessageTTSButtonProps {
  content: string;
}

export const MessageTTSButton = memo(function MessageTTSButton({ content }: MessageTTSButtonProps) {
  const configFetch = useChatConfigStore((s) => s.fetch);
  const { state, play, stop } = useMessageTTS({
    apiBaseUrl: '',
    fetchFn: configFetch,
  });

  const handleClick = () => {
    if (state === 'idle') {
      play(content);
    } else {
      stop();
    }
  };

  return (
    <button
      onClick={handleClick}
      className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
      aria-label={state === 'idle' ? 'Vorlesen' : 'Stoppen'}
      title={state === 'idle' ? 'Vorlesen' : 'Stoppen'}
    >
      <TTSIcon state={state} />
    </button>
  );
});

function TTSIcon({ state }: { state: TTSState }) {
  switch (state) {
    case 'loading':
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case 'playing':
      return <Square className="h-3.5 w-3.5 fill-current" />;
    default:
      return <Volume2 className="h-4 w-4" />;
  }
}
