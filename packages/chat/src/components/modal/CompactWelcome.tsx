import { useComposerRuntime } from '@assistant-ui/react';
import { type ReactNode } from 'react';

import { cn } from '../../lib/utils';

export interface CompactWelcomeProps {
  /** Large icon shown above the description. */
  icon: ReactNode;
  /** Description text shown above the suggestion buttons. */
  description: string;
  /** Suggestion strings; clicking inserts them into the composer. */
  suggestions?: string[];
  /** Background color class for the icon circle. Defaults to `bg-primary/10`. */
  iconBgClassName?: string;
}

export function CompactWelcome({
  icon,
  description,
  suggestions,
  iconBgClassName,
}: CompactWelcomeProps) {
  const composerRuntime = useComposerRuntime();

  return (
    <div className="flex flex-col items-center px-4 pt-6 pb-4 text-center">
      <div
        className={cn(
          'mb-3 flex h-12 w-12 items-center justify-center rounded-xl',
          iconBgClassName ?? 'bg-primary/10'
        )}
      >
        {icon}
      </div>
      <p className="mb-4 text-sm text-foreground-muted">{description}</p>
      {suggestions && suggestions.length > 0 && (
        <div className="flex w-full flex-col gap-1.5">
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-surface-hover"
              onClick={() => composerRuntime.setText(text)}
            >
              <span className="text-foreground">{text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
