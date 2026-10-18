import {
  type EntityComment,
  type MarketplaceItem,
  type ReactionSummary,
} from '@gruenerator/contracts';
import {
  MARKETPLACE_COMMENT_TYPE,
  entityCommentsKey,
  useAddEntityComment,
  useDeleteEntityComment,
  useEntityComments,
  useToggleCommentReaction,
  useToggleItemReaction,
} from '@gruenerator/shared/comments';
import { errMessage } from '@gruenerator/shared/groups';
import { canReport, type MarketplaceTarget } from '@gruenerator/shared/marketplace';
import { Button, toast } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { PiFlag, PiHeart, PiHeartFill, PiLink } from 'react-icons/pi';

import { useMarketplaceActions } from './useMarketplaceActions';

import { CommentThread } from '@/components/common/CommentThread';
import { ReportDialog } from '@/components/common/ReportDialog';
import { ReactionBar } from '@/components/reactions/ReactionBar';
import { useAuthStore } from '@/stores/authStore';
import { getPublicAppOrigin } from '@/utils/platform';
import { copyToClipboard } from '@/utils/shareUtils';

const hasReacted = (reactions: ReactionSummary[], emoji: string) =>
  reactions.find((r) => r.emoji === emoji)?.reacted ?? false;

function ItemReactions({
  target,
  reactions,
}: {
  target: MarketplaceTarget;
  reactions: ReactionSummary[];
}) {
  const { toggle } = useToggleItemReaction(MARKETPLACE_COMMENT_TYPE[target.kind], target.ref);
  return (
    <ReactionBar
      reactions={reactions}
      onToggle={(emoji) => toggle(emoji, hasReacted(reactions, emoji))}
    />
  );
}

function CommentActions({
  comment,
  canReportIt,
  onReport,
}: {
  comment: EntityComment;
  canReportIt: boolean;
  onReport: (comment: EntityComment) => void;
}) {
  const { toggle } = useToggleCommentReaction(comment);
  return (
    <>
      <ReactionBar
        reactions={comment.reactions}
        onToggle={(emoji) => toggle(emoji, hasReacted(comment.reactions, emoji))}
      />
      {canReportIt && (
        <button
          type="button"
          aria-label={`Kommentar von ${comment.authorName} melden`}
          className="cursor-pointer border-none bg-transparent p-0 font-bold text-muted-foreground hover:text-foreground"
          onClick={() => onReport(comment)}
        >
          Melden
        </button>
      )}
    </>
  );
}

async function copyLink(href: string) {
  try {
    await copyToClipboard(new URL(href, getPublicAppOrigin()).href);
    toast.success('Link kopiert');
  } catch {
    toast.error('Der Link konnte nicht kopiert werden.');
  }
}

interface MarketplaceDiscussionProps {
  /** What the comments and reactions hang on — `(kind, ref)`, the same key as likes. */
  target: MarketplaceTarget;
  /**
   * The item as the Marktplatz lists it, for its like and its report. `null`
   * where the Marktplatz does not list it (a private or project-only agent) or
   * where the surrounding view already offers both.
   */
  item: MarketplaceItem | null;
  /** The item's owner may delete other people's comments. */
  canModerate: boolean;
  /** „Link kopieren" points here; left out where the page has its own way to share. */
  shareHref?: string;
}

/**
 * The one interaction block under every Marktplatz item, whatever its kind:
 * like, share, report, reactions on the item, then the comments — each
 * comment with its reactions and, for other people's, „Melden".
 */
export function MarketplaceDiscussion({
  target,
  item,
  canModerate,
  shareHref,
}: MarketplaceDiscussionProps): JSX.Element {
  const type = MARKETPLACE_COMMENT_TYPE[target.kind];
  const userId = useAuthStore((s) => s.user?.id) ?? null;
  const queryClient = useQueryClient();
  const discussion = useEntityComments(type, target.ref);
  const addComment = useAddEntityComment(type, target.ref);
  const deleteComment = useDeleteEntityComment(type, target.ref);
  const { actions, dialogs } = useMarketplaceActions();
  const [reporting, setReporting] = useState<EntityComment | null>(null);

  return (
    <section aria-label="Reaktionen und Kommentare" className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center gap-sm">
        {item && (
          <Button
            variant="ghost"
            aria-pressed={item.liked}
            aria-label={`Gefällt mir (${item.likesCount})`}
            title="Gefällt mir"
            onClick={() => actions.toggleLike(item)}
          >
            {item.liked ? (
              <PiHeartFill aria-hidden className="text-primary-600 dark:text-primary-400" />
            ) : (
              <PiHeart aria-hidden />
            )}
            <span aria-hidden className="tabular-nums">
              {item.likesCount}
            </span>
          </Button>
        )}
        {shareHref && (
          <Button variant="ghost" onClick={() => void copyLink(shareHref)}>
            <PiLink aria-hidden />
            Link kopieren
          </Button>
        )}
        {item && canReport(item) && (
          <Button variant="ghost" onClick={() => actions.report(item)}>
            <PiFlag aria-hidden />
            Melden
          </Button>
        )}
        {discussion.data && <ItemReactions target={target} reactions={discussion.data.reactions} />}
      </div>

      <h2 className="m-0 text-lg font-bold text-foreground-heading">Kommentare</h2>
      {discussion.isLoading && <p className="m-0 text-sm text-foreground-muted">Lädt …</p>}
      {discussion.isError && (
        <p className="m-0 text-sm text-red-600 dark:text-red-400">{errMessage(discussion.error)}</p>
      )}
      {discussion.data && (
        <CommentThread
          comments={discussion.data.comments}
          currentUserId={userId}
          canModerate={canModerate}
          onSubmit={(input) => addComment.mutateAsync(input)}
          onDelete={(id) => deleteComment.mutate(id)}
          deleting={deleteComment.isPending}
          renderActions={(c) => (
            <CommentActions
              comment={c}
              canReportIt={!!userId && c.userId !== userId}
              onReport={setReporting}
            />
          )}
        />
      )}

      {reporting && (
        <ReportDialog
          open
          onOpenChange={(open) => !open && setReporting(null)}
          kind="entity_comment"
          targetId={reporting.id}
          title={`Kommentar von ${reporting.authorName}`}
          // Enough reports hide the comment at once; the list should not keep showing it.
          onReported={() =>
            void queryClient.invalidateQueries({ queryKey: entityCommentsKey(type, target.ref) })
          }
        />
      )}
      {dialogs}
    </section>
  );
}
