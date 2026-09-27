import {
  errMessage,
  formatFeedDate,
  personInitials,
  useAddGroupShareComment,
  useDeleteGroupShareComment,
  useGroupShareComments,
} from '@gruenerator/shared/groups';
import { Button, cn } from '@gruenerator/ui';
import { useRef, useState } from 'react';
import { PiPaperPlaneRight, PiTrash } from 'react-icons/pi';

interface GroupCommentThreadProps {
  id: string;
  groupId: string;
  shareId: string;
  currentUserId: string | null;
  currentUserName: string | null;
  isAdmin: boolean;
}

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
  const deleteComment = useDeleteGroupShareComment(groupId, shareId);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const send = () => {
    const body = draft.trim();
    if (!body || addComment.isPending) return;
    addComment.mutate(body, { onSuccess: () => setDraft('') });
  };

  const list = comments.data ?? [];

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

      {list.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-sm p-0">
          {list.map((c) => {
            const mine = !!currentUserId && c.userId === currentUserId;
            return (
              <li key={c.id} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full text-xs font-bold',
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
                      {c.body}
                    </span>
                  </div>
                  <div className="flex items-center gap-sm pl-3.5 text-xs text-muted-foreground">
                    <time dateTime={c.createdAt}>{formatFeedDate(c.createdAt, 'short')}</time>
                    <button
                      type="button"
                      className="cursor-pointer border-none bg-transparent p-0 font-bold text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setDraft(`@${c.authorName.split(' ')[0]} `);
                        inputRef.current?.focus();
                      }}
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
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white"
        >
          {personInitials(currentUserName)}
        </span>
        <div className="flex items-center gap-1.5 rounded-full border border-grey-200 bg-card py-1 pl-md pr-1 focus-within:border-primary-500 dark:border-grey-700">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Kommentieren …"
            aria-label="Kommentar schreiben"
            maxLength={2000}
            className="h-8 min-w-0 flex-1 border-none bg-transparent text-[15px] text-foreground outline-none"
          />
          <Button
            type="submit"
            variant="brand"
            size="sm"
            className="rounded-full"
            disabled={!draft.trim() || addComment.isPending}
          >
            <PiPaperPlaneRight className="size-4" aria-hidden />
            Senden
          </Button>
        </div>
      </form>
      {addComment.isError && (
        <p className="m-0 text-sm text-red-600 dark:text-red-400">{errMessage(addComment.error)}</p>
      )}
    </div>
  );
}
