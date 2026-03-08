import { type TranscriptEntry } from '@gruenerator/voice';
import { useEffect, useRef } from 'react';

import { cn } from '@/utils/cn';

interface TranscriptProps {
  entries: TranscriptEntry[];
  streamingText: string;
}

export function Transcript({ entries, streamingText }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length, streamingText]);

  if (entries.length === 0 && !streamingText) {
    return (
      <div className="flex flex-1 items-center justify-center text-grey-400 dark:text-grey-500">
        <p className="text-center text-sm">
          Klicke auf den Kreis oben und sprich los.
          <br />
          Ich höre zu und antworte dir.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-sm overflow-y-auto px-md py-sm">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={cn(
            'max-w-[80%] rounded-lg px-md py-sm text-sm',
            entry.role === 'user'
              ? 'self-end bg-primary-500 text-white'
              : 'self-start bg-grey-100 dark:bg-grey-800 text-foreground'
          )}
        >
          {entry.text}
        </div>
      ))}

      {streamingText && (
        <div className="max-w-[80%] self-start rounded-lg bg-grey-100 dark:bg-grey-800 text-foreground px-md py-sm text-sm opacity-70">
          {streamingText}
          <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-foreground" />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
