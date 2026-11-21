import { REACTION_EMOJIS, type ReactionSummary } from '@gruenerator/contracts';
import { type GroupFeedItem } from '@gruenerator/shared/groups';

export const PICKER_EMOJIS: readonly string[] = REACTION_EMOJIS;

/** Ersetzt die Reaktionen der Freigabe im gecachten Feed (der Web-Cache hat eine andere Form). */
export function patchFeedShareReactions(
  items: GroupFeedItem[],
  shareId: string,
  apply: (reactions: ReactionSummary[]) => ReactionSummary[]
): GroupFeedItem[] {
  return items.map((item) =>
    item.share?.shareId === shareId
      ? { ...item, share: { ...item.share, reactions: apply(item.share.reactions ?? []) } }
      : item
  );
}

export function hasReacted(reactions: ReactionSummary[], emoji: string): boolean {
  return reactions.find((r) => r.emoji === emoji)?.reacted ?? false;
}

/** „👍, 3 Reaktionen, du hast reagiert" — für VoiceOver/TalkBack. */
export function reactionChipLabel({ emoji, count, reacted }: ReactionSummary): string {
  const noun = count === 1 ? 'Reaktion' : 'Reaktionen';
  return `${emoji}, ${count} ${noun}${reacted ? ', du hast reagiert' : ''}`;
}

/** Alt-Emojis außerhalb der festen Menge lassen sich nur entfernen, nicht neu setzen. */
export function canToggleEmoji(emoji: string, reacted: boolean): boolean {
  return reacted || PICKER_EMOJIS.includes(emoji);
}
