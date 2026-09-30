import { GROUP_COMMENT_MAX, type GroupShareComment } from '@gruenerator/contracts';
import {
  errMessage,
  formatFeedDate,
  personInitials,
  replyMention,
  threadComments,
  useAddGroupShareComment,
  useDeleteGroupShareComment,
  useGroupShareComments,
} from '@gruenerator/shared/groups';
import { buildMemberMention } from '@gruenerator/shared/utils';
import { Button, cn } from '@gruenerator/ui';
import { useEffect, useRef, useState } from 'react';
import { PiPaperPlaneRight, PiTrash, PiX } from 'react-icons/pi';

import { GroupMentionText, MentionSuggestions, useMentionDraft } from './GroupMentions';
import { CommentReactions } from './GroupReactions';

interface GroupCommentThreadProps {
  id: string;
  groupId: string;
  shareId: string;
  currentUserId: string | null;
  currentUserName: string | null;
  isAdmin: boolean;
}

/** Offene Antwort: an welchem Kommentar oben sie hängt und wem sie antwortet. */
interface ReplyDraft {
  threadId: string;
  toName: string;
}

/**
 * Kommentare eines Beitrags als Threads: Kommentare oben, Antworten eine
 * Ebene eingerückt darunter. „Antworten“ öffnet das Feld unter dem Thread,
 * vorbelegt mit „@Vorname“ der Person, der geantwortet wird.
 */
export function GroupCommentThread({
  id,
  groupId,
  shareId,
  currentUserId,
  currentUserName,
  isAdmin,
}: GroupCommentThreadProps) {
  const comments = useGroupShareComments(groupId, shareId);
  const addComment = useAddGroupShareComment(groupId, shareId);
  const addReply = useAddGroupShareComment(groupId, shareId);
  const deleteComment = useDeleteGroupShareComment(groupId, shareId);
  const draft = useMentionDraft(GROUP_COMMENT_MAX);
  const replyDraft = useMentionDraft(GROUP_COMMENT_MAX);
  const [reply, setReply] = useState<ReplyDraft | null>(null);

  const send = () => {
    const body = draft.serialize();
    if (!body || draft.tooLong || addComment.isPending) return;
    addComment.mutate({ body }, { onSuccess: () => draft.reset() });
  };

  const sendReply = () => {
    const body = replyDraft.serialize();
    if (!reply || !body || replyDraft.tooLong || addReply.isPending) return;
    addReply.mutate({ body, parentId: reply.threadId }, { onSuccess: () => setReply(null) });
  };

  const startReply = (threadId: string, to: GroupShareComment) => {
    addReply.reset();
    // Die Antwort beginnt mit einer echten Erwähnung — die Person bekommt sie mit.
    replyDraft.reset(
      to.userId === currentUserId
        ? ''
        : to.userId
          ? `${buildMemberMention(to.authorName.split(' ')[0]!, to.userId)} `
          : replyMention(to.authorName)
    );
    setReply({ threadId, toName: to.authorName });
  };

  const list = comments.data ?? [];
  const threads = threadComments(list);

  const renderComment = (c: GroupShareComment, threadId: string, isReply: boolean) => {
    const mine = !!currentUserId && c.userId === currentUserId;
    return (
      <div
        className={cn(
          'grid items-start gap-2.5',
          isReply ? 'grid-cols-[1.75rem_minmax(0,1fr)]' : 'grid-cols-[2rem_minmax(0,1fr)]'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex items-center justify-center rounded-full font-bold',
            isReply ? 'size-7 text-[11px]' : 'size-8 text-xs',
            mine
              ? 'bg-primary-600 text-white'
              : 'bg-secondary-100 text-secondary-800 dark:bg-secondary-800 dark:text-secondary-100'
          )}
        >
          {personInitials(c.authorName)}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex max-w-full flex-col gap-0.5 self-start rounded-[4px_16px_16px_16px] bg-card px-3.5 py-2.5">
            <strong className="text-[13px]">{c.authorName}</strong>
            <span className="whitespace-pre-wrap break-words text-[15px] leading-snug">
              <GroupMentionText text={c.body} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-sm pl-3.5 text-xs text-muted-foreground">
            <time dateTime={c.createdAt}>{formatFeedDate(c.createdAt, 'short')}</time>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 font-bold text-muted-foreground hover:text-foreground"
              onClick={() => startReply(threadId, c)}
            >
              Antworten
            </button>
            {(mine || isAdmin) && (
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
            <CommentReactions groupId={groupId} comment={c} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div id={id} className="flex flex-col gap-sm bg-background-alt px-md pb-md pt-sm">
      {comments.isLoading && <p className="m-0 text-sm text-muted-foreground">Lädt …</p>}
      {comments.isError && (
        <p className="m-0 text-sm text-red-600 dark:text-red-400">{errMessage(comments.error)}</p>
      )}
      {!comments.isLoading && !comments.isError && list.length === 0 && (
        <p className="m-0 text-sm text-muted-foreground">
          Noch keine Kommentare. Schreib den ersten.
        </p>
      )}

      {threads.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-sm p-0">
          {threads.map((t) => {
            const replying = reply?.threadId === t.comment.id;
            return (
              <li key={t.comment.id} className="flex flex-col gap-sm">
                {renderComment(t.comment, t.comment.id, false)}
                {(t.replies.length > 0 || replying) && (
                  <div className="ml-4 flex flex-col gap-sm border-l-2 border-grey-200 pl-[18px] dark:border-grey-700">
                    {t.replies.length > 0 && (
                      <ul
                        className="m-0 flex list-none flex-col gap-sm p-0"
                        aria-label={`Antworten auf ${t.comment.authorName}`}
                      >
                        {t.replies.map((r) => (
                          <li key={r.id}>{renderComment(r, t.comment.id, true)}</li>
                        ))}
                      </ul>
                    )}
                    {replying && (
                      <CommentInput
                        small
                        autoFocus
                        mention={replyDraft}
                        onSubmit={sendReply}
                        onCancel={() => setReply(null)}
                        pending={addReply.isPending}
                        userName={currentUserName}
                        placeholder={`${reply.toName.split(' ')[0]} antworten …`}
                        label={`Antwort an ${reply.toName}`}
                        error={addReply.isError ? errMessage(addReply.error) : null}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CommentInput
        mention={draft}
        onSubmit={send}
        pending={addComment.isPending}
        userName={currentUserName}
        placeholder="Kommentieren …"
        label="Kommentar schreiben"
        error={addComment.isError ? errMessage(addComment.error) : null}
      />
    </div>
  );
}

interface CommentInputProps {
  mention: ReturnType<typeof useMentionDraft>;
  onSubmit: () => void;
  onCancel?: () => void;
  pending: boolean;
  userName: string | null;
  placeholder: string;
  label: string;
  error: string | null;
  small?: boolean;
  autoFocus?: boolean;
}

function CommentInput({
  mention,
  onSubmit,
  onCancel,
  pending,
  userName,
  placeholder,
  label,
  error,
  small = false,
  autoFocus = false,
}: CommentInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Eine Antwort öffnet sich per Klick auf „Antworten“: der Fokus folgt dorthin, einmal.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className="flex flex-col gap-xs">
      <form
        className={cn(
          'grid items-center gap-2.5',
          small ? 'grid-cols-[1.75rem_minmax(0,1fr)]' : 'grid-cols-[2rem_minmax(0,1fr)]'
        )}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <span
          aria-hidden
          className={cn(
            'flex items-center justify-center rounded-full bg-primary-600 font-bold text-white',
            small ? 'size-7 text-[11px]' : 'size-8 text-xs'
          )}
        >
          {personInitials(userName)}
        </span>
        <div className="relative flex items-center gap-1.5 rounded-full border border-grey-200 bg-card py-1 pl-md pr-1 focus-within:border-primary-500 dark:border-grey-700">
          <input
            ref={inputRef}
            {...mention.inputProps}
            onKeyDown={(e) => {
              if (mention.handleKey(e)) return;
              if (e.key === 'Escape' && onCancel) onCancel();
            }}
            placeholder={placeholder}
            aria-label={label}
            className="h-8 min-w-0 flex-1 border-none bg-transparent text-[15px] text-foreground outline-none"
          />
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-full text-muted-foreground"
              aria-label="Antwort verwerfen"
              onClick={onCancel}
            >
              <PiX className="size-4" />
            </Button>
          )}
          <Button
            type="submit"
            variant="brand"
            size="sm"
            className="rounded-full"
            disabled={!mention.text.trim() || mention.tooLong || pending}
          >
            <PiPaperPlaneRight className="size-4" aria-hidden />
            Senden
          </Button>
          <MentionSuggestions
            {...mention.listProps}
            inputRef={inputRef}
            className="top-full mt-1"
          />
        </div>
      </form>
      {error && <p className="m-0 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
