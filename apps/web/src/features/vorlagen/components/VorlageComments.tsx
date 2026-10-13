import { type ReactionSummary, type TemplateComment } from '@gruenerator/contracts';
import { errMessage } from '@gruenerator/shared/groups';
import { useToggleReaction } from '@gruenerator/shared/reactions';

import {
  templateCommentsKey,
  useAddTemplateComment,
  useDeleteTemplateComment,
  useTemplateComments,
} from '../hooks/useTemplateComments';

import { CommentThread } from '@/components/common/CommentThread';
import { useUserTemplates } from '@/features/auth/hooks/useProfileData';
import { ReactionBar } from '@/components/reactions/ReactionBar';
import { useAuthStore } from '@/stores/authStore';

function CommentReactions({ comment }: { comment: TemplateComment }) {
  const { toggle } = useToggleReaction<TemplateComment[]>({
    entityType: 'template_comment',
    entityId: comment.id,
    queryKey: templateCommentsKey(comment.templateId),
    update: (data, apply) =>
      data.map((c) => (c.id === comment.id ? { ...c, reactions: apply(c.reactions) } : c)),
  });
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
  const comments = useTemplateComments(templateId);
  const addComment = useAddTemplateComment(templateId);
  const deleteComment = useDeleteTemplateComment(templateId);
  const { query: ownTemplates } = useUserTemplates({ isActive: true });
  const isOwner = ownTemplates.data?.some((t) => String(t.id) === templateId) ?? false;

  return (
    <section aria-label="Kommentare" className="flex flex-col gap-md">
      <h3 className="m-0 text-base font-bold">Kommentare</h3>
      {comments.isLoading && <p className="m-0 text-sm text-muted-foreground">Lädt …</p>}
      {comments.isError && (
        <p className="m-0 text-sm text-red-600 dark:text-red-400">{errMessage(comments.error)}</p>
      )}
      {comments.data && (
        <CommentThread
          comments={comments.data}
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
