import { REACTION_EMOJIS, type ReactionSummary } from '@gruenerator/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { SmilePlus } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/utils/cn';

interface ReactionBarProps {
  reactions: ReactionSummary[];
  onToggle: (emoji: string) => void;
  disabled?: boolean;
  className?: string;
}

const FIXED_EMOJIS: readonly string[] = REACTION_EMOJIS;

function chipLabel({ emoji, count, reacted }: ReactionSummary): string {
  const noun = count === 1 ? 'Reaktion' : 'Reaktionen';
  if (!reacted) return `${emoji} – ${count} ${noun}`;
  return count === 1
    ? `${emoji} – 1 Reaktion, von dir`
    : `${emoji} – ${count} ${noun}, darunter deine`;
}

export function ReactionBar({
  reactions,
  onToggle,
  disabled = false,
  className,
}: ReactionBarProps) {
  const [open, setOpen] = useState(false);
  const reacted = new Set(reactions.filter((r) => r.reacted).map((r) => r.emoji));

  const choose = (emoji: string) => {
    setOpen(false);
    onToggle(emoji);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          aria-pressed={r.reacted}
          aria-label={chipLabel(r)}
          // Legacy emojis outside the fixed set can be removed, not added.
          disabled={disabled || (!r.reacted && !FIXED_EMOJIS.includes(r.emoji))}
          onClick={() => onToggle(r.emoji)}
          className={cn(
            'flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2 text-xs tabular-nums text-foreground transition-colors disabled:cursor-default',
            r.reacted
              ? 'border-primary-500 bg-primary-500/15'
              : 'border-border bg-transparent hover:bg-hover-alt'
          )}
        >
          <span aria-hidden>{r.emoji}</span>
          <span aria-hidden>{r.count}</span>
        </button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Reaktion hinzufügen"
            disabled={disabled}
            className="flex size-7 cursor-pointer items-center justify-center rounded-full border border-border bg-transparent text-muted-foreground transition-colors hover:bg-hover-alt hover:text-foreground disabled:cursor-default"
          >
            <SmilePlus className="size-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label="Reaktion auswählen"
          className="flex w-auto gap-0.5 p-1"
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-pressed={reacted.has(emoji)}
              aria-label={`Mit ${emoji} reagieren`}
              onClick={() => choose(emoji)}
              className={cn(
                'flex size-8 cursor-pointer items-center justify-center rounded-md text-lg transition-colors hover:bg-hover-alt',
                reacted.has(emoji) && 'bg-primary-500/15'
              )}
            >
              {emoji}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
