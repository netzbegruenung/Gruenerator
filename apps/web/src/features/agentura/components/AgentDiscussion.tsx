import { GROUP_COMMENT_MAX, type AgentComment, type ReactionSummary } from '@gruenerator/contracts';
import {
  errMessage,
  formatFeedDate,
  personInitials,
  threadComments,
} from '@gruenerator/shared/groups';
import {
  agentCommentsKey,
  patchAgentCommentReactions,
  patchAgentReactions,
  useAddAgentComment,
  useAgentComments,
  useDeleteAgentComment,
  useToggleReaction,
  type AgentDiscussion as AgentDiscussionData,
} from '@gruenerator/shared/reactions';
import { Button, cn } from '@gruenerator/ui';
import { useState } from 'react';
import { PiPaperPlaneRight, PiTrash } from 'react-icons/pi';

import { ReactionBar } from '@/components/reactions/ReactionBar';
import { useAuthStore } from '@/stores/authStore';

const hasReacted = (reactions: ReactionSummary[], emoji: string) =>
  reactions.find((r) => r.emoji === emoji)?.reacted ?? false;

function AgentReactions({ agentId, reactions }: { agentId: string; reactions: ReactionSummary[] }) {
  const { toggle } = useToggleReaction<AgentDiscussionData>({
    entityType: 'agent',
    entityId: agentId,
    queryKey: agentCommentsKey(agentId),
    update: patchAgentReactions,
  });
  return (
    <ReactionBar
      reactions={reactions}
      onToggle={(emoji) => toggle(emoji, hasReacted(reactions, emoji))}
    />
  );
}

function CommentReactions({ comment }: { comment: AgentComment }) {
  const { toggle } = useToggleReaction<AgentDiscussionData>({
    entityType: 'agent_comment',
    entityId: comment.id,
    queryKey: agentCommentsKey(comment.agentId),
    update: (data, apply) => patchAgentCommentReactions(data, comment.id, apply),
  });
  return (
    <ReactionBar
      reactions={comment.reactions}
      onToggle={(emoji) => toggle(emoji, hasReacted(comment.reactions, emoji))}
    />
  );
}

interface CommentInputProps {
  placeholder: string;
  pending: boolean;
  error: string | null;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

function CommentInput({
  placeholder,
  pending,
  error,
  onSubmit,
  onCancel,
  autoFocus,
}: CommentInputProps) {
  const [text, setText] = useState('');
  const body = text.trim();
  return (
    <div className="flex flex-col gap-xs">
      <form
        className="flex items-center gap-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body || pending) return;
          onSubmit(body);
          setText('');
        }}
      >
        <input
          autoFocus={autoFocus}
          value={text}
          maxLength={GROUP_COMMENT_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-10 min-w-0 flex-1 rounded-full border border-grey-200 bg-card px-md text-[15px] text-foreground outline-none focus:border-primary-500 dark:border-grey-700"
        />
        <Button
          type="submit"
          variant="brand"
          size="sm"
          className="rounded-full"
          disabled={!body || pending}
        >
          <PiPaperPlaneRight className="size-4" aria-hidden />
          Senden
        </Button>
      </form>
      {error && <p className="m-0 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** Reaktionen auf den Agenten und Kommentar-Threads darunter, wie im Gruppen-Feed. */
export function AgentDiscussion({ agentId, isOwner }: { agentId: string; isOwner: boolean }) {
  const userId = useAuthStore((s) => s.user?.id) ?? null;
  const discussion = useAgentComments(agentId);
  const addComment = useAddAgentComment(agentId);
  const addReply = useAddAgentComment(agentId);
  const deleteComment = useDeleteAgentComment(agentId);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  if (discussion.isLoading) return <p className="text-foreground-muted">Lädt …</p>;
  if (discussion.isError) {
    return (
      <p className="m-0 text-sm text-red-600 dark:text-red-400">{errMessage(discussion.error)}</p>
    );
  }
  const { reactions, comments } = discussion.data!;
  const threads = threadComments(comments);

  const renderComment = (c: AgentComment, threadId: string) => {
    const mine = !!userId && c.userId === userId;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex max-w-full flex-col gap-0.5 self-start rounded-[4px_16px_16px_16px] bg-card px-3.5 py-2.5">
          <span className="flex items-center gap-xs text-[13px] font-bold">
            <span
              aria-hidden
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-[10px]',
                mine
                  ? 'bg-primary-600 text-white'
                  : 'bg-secondary-100 text-secondary-800 dark:bg-secondary-800 dark:text-secondary-100'
              )}
            >
              {personInitials(c.authorName)}
            </span>
            {c.authorName}
          </span>
          <span className="whitespace-pre-wrap break-words text-[15px] leading-snug">{c.body}</span>
        </div>
        <div className="flex flex-wrap items-center gap-sm pl-3.5 text-xs text-muted-foreground">
          <time dateTime={c.createdAt}>{formatFeedDate(c.createdAt, 'short')}</time>
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 font-bold text-muted-foreground hover:text-foreground"
            onClick={() => {
              addReply.reset();
              setReplyTo(threadId);
            }}
          >
            Antworten
          </button>
          {(mine || isOwner) && (
            <button
              type="button"
              aria-label="Kommentar löschen"
              className="flex cursor-pointer items-center border-none bg-transparent p-0 text-muted-foreground hover:text-red-600"
              disabled={deleteComment.isPending}
              onClick={() => deleteComment.mutate(c.id)}
            >
              <PiTrash className="size-3.5" />
            </button>
          )}
          <CommentReactions comment={c} />
        </div>
      </div>
    );
  };

  return (
    <section aria-label="Reaktionen und Kommentare" className="mt-xl flex flex-col gap-md">
      <AgentReactions agentId={agentId} reactions={reactions} />
      <h2 className="m-0 text-lg font-bold">Kommentare</h2>
      {comments.length === 0 && (
        <p className="m-0 text-sm text-muted-foreground">
          Noch keine Kommentare. Schreib den ersten.
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-md p-0">
        {threads.map((t) => (
          <li key={t.comment.id} className="flex flex-col gap-sm">
            {renderComment(t.comment, t.comment.id)}
            {(t.replies.length > 0 || replyTo === t.comment.id) && (
              <div className="ml-4 flex flex-col gap-sm border-l-2 border-grey-200 pl-[18px] dark:border-grey-700">
                {t.replies.map((r) => (
                  <div key={r.id}>{renderComment(r, t.comment.id)}</div>
                ))}
                {replyTo === t.comment.id && (
                  <CommentInput
                    autoFocus
                    placeholder={`${t.comment.authorName.split(' ')[0]} antworten …`}
                    pending={addReply.isPending}
                    error={addReply.isError ? errMessage(addReply.error) : null}
                    onCancel={() => setReplyTo(null)}
                    onSubmit={(body) =>
                      addReply.mutate(
                        { body, parentId: t.comment.id },
                        { onSuccess: () => setReplyTo(null) }
                      )
                    }
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <CommentInput
        placeholder="Kommentieren …"
        pending={addComment.isPending}
        error={addComment.isError ? errMessage(addComment.error) : null}
        onSubmit={(body) => addComment.mutate({ body })}
      />
    </section>
  );
}
