import { type EntityComment, type ReactionSummary } from '@gruenerator/contracts';
import {
  useAddEntityComment,
  useDeleteEntityComment,
  useEntityComments,
  useToggleCommentReaction,
} from '@gruenerator/shared/comments';
import { errMessage } from '@gruenerator/shared/groups';

import { CommentThread } from '@/components/common/CommentThread';
import { ReactionBar } from '@/components/reactions/ReactionBar';
import { useUserTemplates } from '@/features/auth/hooks/useProfileData';
import { useAuthStore } from '@/stores/authStore';

function CommentReactions({ comment }: { comment: EntityComment }) {
  const { toggle } = useToggleCommentReaction(comment);
  const hasReacted = (reactions: ReactionSummary[], emoji: string) =>
    reactions.find((r) => r.emoji === emoji)?.reacted ?? false;
  return (
    <ReactionBar
      reactions={comment.reactions}
      onToggle={(emoji) => toggle(emoji, hasReacted(comment.reactions, emoji))}
    />
  );
}

/** Kommentare unter einer Vorlage; die eigene Vorlage darf fremde Kommentare löschen. */
export function VorlageComments({ templateId }: { templateId: string }) {
  const userId = useAuthStore((s) => s.user?.id) ?? null;
  const discussion = useEntityComments('template', templateId);
  const addComment = useAddEntityComment('template', templateId);
  const deleteComment = useDeleteEntityComment('template', templateId);
  const { query: ownTemplates } = useUserTemplates({ isActive: true });
  const isOwner = ownTemplates.data?.some((t) => String(t.id) === templateId) ?? false;

  return (
    <section aria-label="Kommentare" className="flex flex-col gap-md">
      <h3 className="m-0 text-base font-bold">Kommentare</h3>
      {discussion.isLoading && <p className="m-0 text-sm text-muted-foreground">Lädt …</p>}
      {discussion.isError && (
        <p className="m-0 text-sm text-red-600 dark:text-red-400">{errMessage(discussion.error)}</p>
      )}
      {discussion.data && (
        <CommentThread
          comments={discussion.data.comments}
          currentUserId={userId}
          canModerate={isOwner}
          onSubmit={(input) => addComment.mutateAsync(input)}
          onDelete={(id) => deleteComment.mutate(id)}
          deleting={deleteComment.isPending}
          renderActions={(c) => <CommentReactions comment={c} />}
        />
      )}
    </section>
  );
}
