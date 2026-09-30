import {
  type GroupShareComment,
  type GroupShareMeta,
  type ReactionSummary,
} from '@gruenerator/contracts';
import {
  groupContentKey,
  groupShareCommentsKey,
  patchCommentReactions,
  patchShareReactions,
  type GroupContentBuckets,
} from '@gruenerator/shared/groups';
import { useToggleReaction } from '@gruenerator/shared/reactions';

import { ReactionBar } from '@/components/reactions/ReactionBar';

const hasReacted = (reactions: ReactionSummary[], emoji: string) =>
  reactions.find((r) => r.emoji === emoji)?.reacted ?? false;

export function ShareReactions({
  groupId,
  share,
  className,
}: {
  groupId: string;
  share: GroupShareMeta;
  className?: string;
}) {
  const { toggle } = useToggleReaction<GroupContentBuckets>({
    entityType: 'group_share',
    entityId: share.shareId,
    queryKey: groupContentKey(groupId),
    update: (data, apply) => patchShareReactions(data, share.shareId, apply),
  });
  return (
    <ReactionBar
      reactions={share.reactions}
      onToggle={(emoji) => toggle(emoji, hasReacted(share.reactions, emoji))}
      className={className}
    />
  );
}

export function CommentReactions({
  groupId,
  comment,
  className,
}: {
  groupId: string;
  comment: GroupShareComment;
  className?: string;
}) {
  const { toggle } = useToggleReaction<GroupShareComment[]>({
    entityType: 'group_comment',
    entityId: comment.id,
    queryKey: groupShareCommentsKey(groupId, comment.shareId),
    update: (data, apply) => patchCommentReactions(data, comment.id, apply),
  });
  return (
    <ReactionBar
      reactions={comment.reactions}
      onToggle={(emoji) => toggle(emoji, hasReacted(comment.reactions, emoji))}
      className={className}
    />
  );
}
