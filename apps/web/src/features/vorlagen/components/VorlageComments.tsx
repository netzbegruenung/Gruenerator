import { errMessage } from '@gruenerator/shared/groups';

import {
  useAddTemplateComment,
  useDeleteTemplateComment,
  useTemplateComments,
} from '../hooks/useTemplateComments';

import { CommentThread } from '@/components/common/CommentThread';
import { useUserTemplates } from '@/features/auth/hooks/useProfileData';
import { useAuthStore } from '@/stores/authStore';

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
        />
      )}
    </section>
  );
}
