import { type ReactionSummary, type TemplateEngagementResponse } from '@gruenerator/contracts';
import { useToggleReaction } from '@gruenerator/shared/reactions';
import { type QueryKey } from '@tanstack/react-query';
import { type JSX } from 'react';

import { ReactionBar } from '../../../components/reactions/ReactionBar';

interface TemplateReactionsProps {
  templateId: string;
  reactions: ReactionSummary[];
  /** An engagement query (`useTemplateEngagement`) that carries this Vorlage. */
  queryKey: QueryKey;
}

/** Emoji reactions on one Vorlage, optimistic on the engagement query. */
export function TemplateReactions({
  templateId,
  reactions,
  queryKey,
}: TemplateReactionsProps): JSX.Element {
  const { toggle } = useToggleReaction<TemplateEngagementResponse>({
    entityType: 'template',
    entityId: templateId,
    queryKey,
    update: (data, apply) => ({
      ...data,
      items: data.items.some((item) => item.id === templateId)
        ? data.items.map((item) =>
            item.id === templateId ? { ...item, reactions: apply(item.reactions) } : item
          )
        : [...data.items, { id: templateId, likes_count: 0, reactions: apply([]) }],
    }),
  });

  return (
    <ReactionBar
      reactions={reactions}
      onToggle={(emoji) =>
        toggle(emoji, reactions.find((r) => r.emoji === emoji)?.reacted ?? false)
      }
    />
  );
}
