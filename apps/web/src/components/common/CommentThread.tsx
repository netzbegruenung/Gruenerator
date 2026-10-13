import { GROUP_COMMENT_MAX } from '@gruenerator/contracts';
import {
  errMessage,
  formatFeedDate,
  personInitials,
  threadComments,
} from '@gruenerator/shared/groups';
import { Button, cn } from '@gruenerator/ui';
import { useState, type ReactNode } from 'react';
import { PiPaperPlaneRight, PiTrash } from 'react-icons/pi';

export interface ThreadComment {
  id: string;
  parentId: string | null;
  userId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

interface CommentThreadProps<T extends ThreadComment> {
  comments: T[];
  currentUserId: string | null;
  /** Besitzer*in des Gegenstands: darf fremde Kommentare löschen. */
  canModerate: boolean;
  onSubmit: (input: { body: string; parentId?: string }) => Promise<unknown>;
  onDelete: (commentId: string) => void;
  deleting?: boolean;
  /** Platz neben „Antworten“, z. B. Reaktionen. */
  renderActions?: (comment: T) => ReactNode;
}

interface CommentInputProps {
  placeholder: string;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
  autoFocus?: boolean;
}

function CommentInput({ placeholder, onSubmit, onCancel, autoFocus }: CommentInputProps) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = text.trim();

  const submit = async () => {
    if (!body || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(body);
      setText('');
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-xs">
      <form
        className="flex items-center gap-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
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

/** Kommentar-Threads mit einer Antwortebene und Eingabefeld, wie im Gruppen-Feed. */
export function CommentThread<T extends ThreadComment>({
  comments,
  currentUserId,
  canModerate,
  onSubmit,
  onDelete,
  deleting = false,
  renderActions,
}: CommentThreadProps<T>) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const threads = threadComments(comments);

  const renderComment = (c: T, threadId: string) => {
    const mine = !!currentUserId && c.userId === currentUserId;
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
            onClick={() => setReplyTo(threadId)}
          >
            Antworten
          </button>
          {(mine || canModerate) && (
            <button
              type="button"
              aria-label="Kommentar löschen"
              className="flex cursor-pointer items-center border-none bg-transparent p-0 text-muted-foreground hover:text-red-600"
              disabled={deleting}
              onClick={() => onDelete(c.id)}
            >
              <PiTrash className="size-3.5" />
            </button>
          )}
          {renderActions?.(c)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-md">
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
                    onCancel={() => setReplyTo(null)}
                    onSubmit={(body) =>
                      onSubmit({ body, parentId: t.comment.id }).then(() => setReplyTo(null))
                    }
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <CommentInput placeholder="Kommentieren …" onSubmit={(body) => onSubmit({ body })} />
    </div>
  );
}
