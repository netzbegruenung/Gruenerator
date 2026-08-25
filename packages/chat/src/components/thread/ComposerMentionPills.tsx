'use client';

import { cn } from '@gruenerator/ui';

import { mentionableKey, type Mentionable } from '../../lib/mentionables';
import { ComposerToken } from './ComposerToken';

interface ComposerMentionPillsProps {
  mentions: Mentionable[];
  onRemove: (mention: Mentionable) => void;
  className?: string;
}

/**
 * Selected @-mentions rendered as chips in the composer (ChatGPT-style) instead
 * of raw `@websuche` text. Shares ComposerToken with the pinned-connector chip.
 */
export function ComposerMentionPills({ mentions, onRemove, className }: ComposerMentionPillsProps) {
  if (mentions.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {mentions.map((m) => (
        <ComposerToken
          key={mentionableKey(m)}
          icon={m.icon ?? null}
          glyph={m.avatar}
          brandColor={m.backgroundColor}
          label={m.title}
          removeLabel={`${m.title} entfernen`}
          onRemove={() => onRemove(m)}
        />
      ))}
    </div>
  );
}
