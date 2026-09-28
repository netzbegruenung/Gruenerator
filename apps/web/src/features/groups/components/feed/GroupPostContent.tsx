import { GROUP_POST_MAX } from '@gruenerator/contracts';
import {
  errMessage,
  formatFileSize,
  groupPostFilePath,
  useUpdateGroupPost,
  type GroupPostContent as PostContent,
} from '@gruenerator/shared/groups';
import { Button, cn, Textarea } from '@gruenerator/ui';
import { useRef } from 'react';
import { PiDownloadSimple } from 'react-icons/pi';

import { FileBadge } from './GroupComposer';
import { GroupMentionText, MentionSuggestions, useMentionDraft } from './GroupMentions';

interface GroupPostContentProps {
  groupId: string;
  postId: string;
  post: PostContent;
  editing: boolean;
  onEditDone: () => void;
}

/** Bildhöhen wie im Entwurf: eins groß, zwei halb, ab drei ein Raster. */
function gridFor(count: number) {
  if (count === 1) return { cols: 'grid-cols-1', height: 'h-[380px]' };
  if (count === 2) return { cols: 'grid-cols-2', height: 'h-[260px]' };
  return { cols: 'grid-cols-3', height: 'h-[180px]' };
}

/** Text, Bilder und Dateien eines eigenen Beitrags; die Verfasser*in kann den Text ändern. */
export function GroupPostContent({
  groupId,
  postId,
  post,
  editing,
  onEditDone,
}: GroupPostContentProps) {
  const draft = useMentionDraft(post.body);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const update = useUpdateGroupPost(groupId);
  const images = post.files.filter((f) => f.isImage);
  const others = post.files.filter((f) => !f.isImage);
  const grid = gridFor(images.length);
  const canSave = (draft.text.trim().length > 0 || post.files.length > 0) && !update.isPending;

  return (
    <div className="flex flex-col gap-sm px-md pt-sm">
      {editing ? (
        <div className="relative flex flex-col gap-xs">
          <Textarea
            ref={textarea}
            {...draft.inputProps}
            autoFocus
            rows={4}
            maxLength={GROUP_POST_MAX}
            aria-label="Beitrag bearbeiten"
            onKeyDown={(e) => {
              if (draft.handleKey(e)) return;
              if (e.key === 'Escape') onEditDone();
            }}
          />
          <MentionSuggestions {...draft.listProps} inputRef={textarea} className="top-full" />
          {update.isError && (
            <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
              {errMessage(update.error)}
            </p>
          )}
          <div className="flex justify-end gap-xs">
            <Button variant="ghost" size="sm" onClick={onEditDone} disabled={update.isPending}>
              Abbrechen
            </Button>
            <Button
              variant="brand"
              size="sm"
              disabled={!canSave}
              onClick={() =>
                update.mutate({ postId, body: draft.serialize() }, { onSuccess: onEditDone })
              }
            >
              Speichern
            </Button>
          </div>
        </div>
      ) : (
        post.body && (
          <p className="m-0 whitespace-pre-wrap break-words text-base leading-relaxed">
            <GroupMentionText text={post.body} />
            {post.editedAt && (
              <span className="ml-xs text-[13px] text-muted-foreground">(bearbeitet)</span>
            )}
          </p>
        )
      )}

      {images.length > 0 && (
        <ul
          className={cn('m-0 grid list-none gap-1 overflow-hidden rounded-[14px] p-0', grid.cols)}
        >
          {images.map((f) => {
            const src = groupPostFilePath(groupId, postId, f.id);
            return (
              <li key={f.id} className={cn('bg-background-alt', grid.height)}>
                <a href={src} target="_blank" rel="noreferrer" className="block size-full">
                  <img src={src} alt={f.name} loading="lazy" className="size-full object-cover" />
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {others.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-xs p-0">
          {others.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-sm rounded-[14px] border border-grey-200 p-xs pl-sm dark:border-grey-700"
            >
              <FileBadge name={f.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{f.name}</span>
                <span className="text-xs text-muted-foreground">{formatFileSize(f.sizeBytes)}</span>
              </span>
              <Button variant="ghost" size="icon" asChild>
                <a
                  href={groupPostFilePath(groupId, postId, f.id)}
                  download={f.name}
                  aria-label={`${f.name} herunterladen`}
                >
                  <PiDownloadSimple className="size-5" />
                </a>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
