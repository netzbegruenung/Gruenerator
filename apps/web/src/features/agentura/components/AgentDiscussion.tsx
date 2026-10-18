import { type EntityComment, type ReactionSummary } from '@gruenerator/contracts';
import {
  useAddEntityComment,
  useDeleteEntityComment,
  useEntityComments,
  useToggleCommentReaction,
  useToggleItemReaction,
} from '@gruenerator/shared/comments';
import { errMessage } from '@gruenerator/shared/groups';

import { CommentThread } from '@/components/common/CommentThread';
import { ReactionBar } from '@/components/reactions/ReactionBar';
import { useAuthStore } from '@/stores/authStore';

const hasReacted = (reactions: ReactionSummary[], emoji: string) =>
  reactions.find((r) => r.emoji === emoji)?.reacted ?? false;

function AgentReactions({ agentId, reactions }: { agentId: string; reactions: ReactionSummary[] }) {
  const { toggle } = useToggleItemReaction('agent', agentId);
  return (
    <ReactionBar
      reactions={reactions}
      onToggle={(emoji) => toggle(emoji, hasReacted(reactions, emoji))}
    />
  );
}

function CommentReactions({ comment }: { comment: EntityComment }) {
  const { toggle } = useToggleCommentReaction(comment);
  return (
    <ReactionBar
      reactions={comment.reactions}
      onToggle={(emoji) => toggle(emoji, hasReacted(comment.reactions, emoji))}
    />
  );
}

/** Reaktionen auf den Agenten und Kommentar-Threads darunter, wie im Gruppen-Feed. */
export function AgentDiscussion({ agentId, isOwner }: { agentId: string; isOwner: boolean }) {
  const userId = useAuthStore((s) => s.user?.id) ?? null;
  const discussion = useEntityComments('agent', agentId);
  const addComment = useAddEntityComment('agent', agentId);
  const deleteComment = useDeleteEntityComment('agent', agentId);

  if (discussion.isLoading) return <p className="text-foreground-muted">Lädt …</p>;
  if (discussion.isError) {
    return (
      <p className="m-0 text-sm text-red-600 dark:text-red-400">{errMessage(discussion.error)}</p>
    );
  }
  const { reactions, comments } = discussion.data!;

  return (
    <section aria-label="Reaktionen und Kommentare" className="mt-xl flex flex-col gap-md">
      <AgentReactions agentId={agentId} reactions={reactions} />
      <h2 className="m-0 text-lg font-bold">Kommentare</h2>
      <CommentThread
        comments={comments}
        currentUserId={userId}
        canModerate={isOwner}
        onSubmit={(input) => addComment.mutateAsync(input)}
        onDelete={(id) => deleteComment.mutate(id)}
        deleting={deleteComment.isPending}
        renderActions={(c) => <CommentReactions comment={c} />}
      />
    </section>
  );
}
