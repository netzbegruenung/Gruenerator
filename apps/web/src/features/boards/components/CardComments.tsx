import {
  type BoardComment,
  type BoardCommentReply,
  type CommentBlock,
  type ReactionSummary,
} from '@gruenerator/contracts';
import { useMobileKeyboardOffset } from '@gruenerator/shared/hooks';
import { useToggleReaction } from '@gruenerator/shared/reactions';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import { Button } from '@gruenerator/ui';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { FiSend, FiCornerDownRight, FiMessageSquare, FiX } from 'react-icons/fi';
import { useParams } from 'react-router-dom';

import { patchBoardCommentReactions } from '../hooks/boardCommentReactions';
import { boardCommentsKey, useBoardComments } from '../hooks/useBoardComments';

import { UserMentionPopover, type MentionUser } from './UserMentionPopover';

import type { ReactNode } from 'react';

import { RobotAvatar } from '@/components/common/RobotAvatar';
import { ReactionBar } from '@/components/reactions/ReactionBar';

// ── Tracked mention (position in text) ──────────────────────────────────

interface TrackedMention {
  start: number;
  end: number;
  userId: string;
  displayName: string;
  /** Set when the mention picked a specific agent — delegates the comment to it. */
  agentId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatCommentDate(isoString: string): string {
  return formatRelativeTime(isoString, {
    maxDays: 7,
    dateFallback: { day: '2-digit', month: 'short' },
  });
}

function parseTextToBlocks(text: string, mentions: TrackedMention[]): CommentBlock[] {
  if (mentions.length === 0) return [{ type: 'text', text }];

  const sorted = [...mentions].sort((a, b) => a.start - b.start);
  const blocks: CommentBlock[] = [];
  let cursor = 0;

  for (const m of sorted) {
    if (m.start > cursor) {
      blocks.push({ type: 'text', text: text.slice(cursor, m.start) });
    }
    blocks.push({ type: 'mention', userId: m.userId, displayName: m.displayName });
    cursor = m.end;
  }

  if (cursor < text.length) {
    blocks.push({ type: 'text', text: text.slice(cursor) });
  }

  return blocks;
}

function renderBlocks(blocks: CommentBlock[]): ReactNode[] {
  // Stable per-block key from a running character offset (unique, not the array
  // index) so editing keeps element identity without index keys.
  let offset = 0;
  return blocks.map((block) => {
    const key = `block-${offset}`;
    offset += 1 + (block.text ?? block.url ?? block.displayName ?? '').length;
    if (block.type === 'mention') {
      return (
        <span key={key} className="text-primary-600 dark:text-primary-400 font-medium">
          @{block.displayName}
        </span>
      );
    }
    if (block.type === 'link' && block.url) {
      return (
        <a
          key={key}
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 dark:text-primary-400 underline hover:no-underline"
        >
          {block.text ?? block.url}
        </a>
      );
    }
    return <span key={key}>{block.text}</span>;
  });
}

// ── Mention detection ───────────────────────────────────────────────────

function detectMentionQuery(
  text: string,
  caretPos: number
): { query: string; triggerPos: number } | null {
  const before = text.slice(0, caretPos);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  if (atIdx > 0 && before[atIdx - 1] !== ' ' && before[atIdx - 1] !== '\n') return null;
  const query = before.slice(atIdx + 1);
  if (query.includes(' ') || query.includes('\n')) return null;
  return { query, triggerPos: atIdx };
}

// ── Reactions ───────────────────────────────────────────────────────────

const hasReacted = (reactions: ReactionSummary[], emoji: string) =>
  reactions.find((r) => r.emoji === emoji)?.reacted ?? false;

function CommentReactions({
  comment,
  boardId,
  cardId,
}: {
  comment: BoardCommentReply;
  boardId: string;
  cardId: string;
}) {
  const { toggle } = useToggleReaction<BoardComment[]>({
    entityType: 'board_comment',
    entityId: comment.id,
    queryKey: boardCommentsKey(boardId, cardId),
    update: (data, apply) => patchBoardCommentReactions(data, comment.id, apply),
  });
  return (
    <ReactionBar
      reactions={comment.reactionSummaries}
      onToggle={(emoji) => toggle(emoji, hasReacted(comment.reactionSummaries, emoji))}
      className="mt-1"
    />
  );
}

// ── Single comment ──────────────────────────────────────────────────────

interface CommentItemProps {
  comment: BoardCommentReply;
  currentUserId: string;
  currentUserAvatarRobotId: number;
  boardId: string;
  cardId: string;
  isReply?: boolean;
  onReply?: (commentId: string) => void;
  onDelete: (commentId: string) => void;
}

const CommentItem = memo(function CommentItem({
  comment,
  currentUserId,
  boardId,
  cardId,
  isReply,
  onReply,
  onDelete,
}: CommentItemProps) {
  return (
    <div className={`flex gap-2 group ${isReply ? 'ml-8' : ''}`}>
      <RobotAvatar
        robotId={comment.author_avatar_robot_id ?? 1}
        displayName={comment.author_name}
        sizePx={24}
        className="w-6 h-6 shrink-0 mt-0.5"
        alt=""
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground">
            {comment.author_name ?? 'Unbekannt'}
          </span>
          <span className="text-[10px] text-grey-400">{formatCommentDate(comment.created_at)}</span>
          {comment.is_edited && <span className="text-[10px] text-grey-400">(bearbeitet)</span>}
          <div className="sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1 ml-auto transition-opacity">
            {!isReply && onReply && (
              <button
                onClick={() => onReply(comment.id)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-grey-400 hover:text-primary-600 hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer transition-colors"
                title="Antworten"
              >
                <FiCornerDownRight size={16} />
              </button>
            )}
            {comment.user_id === currentUserId && (
              <button
                onClick={() => onDelete(comment.id)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-grey-400 hover:text-red-500 hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer transition-colors"
                title="Löschen"
              >
                <FiX size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-foreground m-0 mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
          {renderBlocks(comment.blocks)}
        </p>

        <CommentReactions comment={comment} boardId={boardId} cardId={cardId} />
      </div>
    </div>
  );
});

// ── Main component ──────────────────────────────────────────────────────

interface CardCommentsProps {
  cardId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatarRobotId: number;
}

export const CardComments = memo(function CardComments({
  cardId,
  currentUserId,
  currentUserName,
  currentUserAvatarRobotId,
}: CardCommentsProps) {
  const { id: boardId } = useParams<{ id: string }>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useMobileKeyboardOffset(textareaRef);

  const [commentText, setCommentText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [trackedMentions, setTrackedMentions] = useState<TrackedMention[]>([]);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTriggerPos, setMentionTriggerPos] = useState(0);
  const [mentionAnchor, setMentionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const { commentsQuery, addComment, deleteComment } = useBoardComments(boardId, cardId);
  const comments = useMemo(() => commentsQuery.data ?? [], [commentsQuery.data]);
  const isLoading = commentsQuery.isLoading;

  // ── Mention handling ────────────────────────────────────────────────

  const updateMentionState = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !boardId) {
      setMentionQuery(null);
      return;
    }

    const caretPos = textarea.selectionStart;
    const detected = detectMentionQuery(textarea.value, caretPos);

    if (detected) {
      setMentionQuery(detected.query);
      setMentionTriggerPos(detected.triggerPos);
      setMentionIndex(0);

      const rect = textarea.getBoundingClientRect();
      setMentionAnchor({ x: rect.left, y: rect.top });
    } else {
      setMentionQuery(null);
    }
  }, [boardId]);

  const handleMentionSelect = useCallback(
    (user: MentionUser) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const insertText = `@${user.displayName} `;
      const before = commentText.slice(0, mentionTriggerPos);
      const after = commentText.slice(textarea.selectionStart);
      const newText = before + insertText + after;

      const mention: TrackedMention = {
        start: mentionTriggerPos,
        end: mentionTriggerPos + insertText.trimEnd().length,
        userId: user.userId,
        displayName: user.displayName,
        ...(user.agentId && { agentId: user.agentId }),
      };

      const offsetDiff = insertText.length - (textarea.selectionStart - mentionTriggerPos);
      const adjusted = trackedMentions.map((m) => {
        if (m.start >= mentionTriggerPos) {
          return { ...m, start: m.start + offsetDiff, end: m.end + offsetDiff };
        }
        return m;
      });

      setCommentText(newText);
      setTrackedMentions([...adjusted, mention]);
      setMentionQuery(null);

      requestAnimationFrame(() => {
        const newCaret = mentionTriggerPos + insertText.length;
        textarea.focus();
        textarea.setSelectionRange(newCaret, newCaret);
      });
    },
    [commentText, mentionTriggerPos, trackedMentions]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCommentText(e.target.value);
      requestAnimationFrame(updateMentionState);
    },
    [updateMentionState]
  );

  // ── Submit ──────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    const blocks = parseTextToBlocks(trimmed, trackedMentions);
    // If a specific agent was @-mentioned, delegate the comment to it.
    const agentId = trackedMentions.find((m) => m.agentId)?.agentId;
    addComment.mutate(
      { blocks, parentId: replyToId ?? undefined, agentId },
      {
        onSuccess: () => {
          setCommentText('');
          setReplyToId(null);
          setTrackedMentions([]);
        },
      }
    );
  }, [commentText, trackedMentions, replyToId, addComment]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionQuery !== null) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((i) => i + 1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMentionQuery(null);
          return;
        }
      }

      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    // handleSubmit must be a dep — otherwise the Cmd/Ctrl+Enter handler keeps a
    // stale closure over the empty initial commentText and never sends.
    [mentionQuery, handleSubmit]
  );

  const totalCount = comments.reduce((sum, c) => sum + 1 + c.replies.length, 0);
  const replyingTo = replyToId ? comments.find((c) => c.id === replyToId) : null;

  return (
    <div className="border-t border-grey-200 dark:border-grey-700 px-4 py-4 sm:px-6">
      <p className="text-sm font-medium text-grey-500 dark:text-grey-100 mb-3">
        <FiMessageSquare className="inline mr-1.5" size={13} />
        Kommentare
        {totalCount > 0 && <span className="text-grey-400 font-normal ml-1">({totalCount})</span>}
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <div className="size-4 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
        </div>
      )}

      {comments.length > 0 && (
        <div className="flex flex-col gap-3 mb-3">
          {comments.map((comment) => (
            <div key={comment.id}>
              <CommentItem
                comment={comment}
                currentUserId={currentUserId}
                currentUserAvatarRobotId={currentUserAvatarRobotId}
                boardId={boardId!}
                cardId={cardId}
                onReply={setReplyToId}
                onDelete={(id) => deleteComment.mutate(id)}
              />
              {comment.replies.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  {comment.replies.map((reply) => (
                    <CommentItem
                      key={reply.id}
                      comment={reply}
                      currentUserId={currentUserId}
                      currentUserAvatarRobotId={currentUserAvatarRobotId}
                      boardId={boardId!}
                      cardId={cardId}
                      isReply
                      onDelete={(id) => deleteComment.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {replyingTo && (
        <div className="flex items-center gap-2 mb-1 px-8">
          <FiCornerDownRight size={12} className="text-grey-400" />
          <span className="text-xs text-grey-400">
            Antwort an {replyingTo.author_name ?? 'Unbekannt'}
          </span>
          <button
            onClick={() => setReplyToId(null)}
            className="text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer text-xs"
          >
            &times;
          </button>
        </div>
      )}

      <div className="flex gap-2 relative">
        <RobotAvatar
          robotId={currentUserAvatarRobotId}
          displayName={currentUserName}
          sizePx={24}
          className="w-6 h-6 shrink-0 mt-1"
          alt=""
        />
        <div className="flex-1 flex flex-col gap-1.5">
          <textarea
            ref={textareaRef}
            value={commentText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onSelect={updateMentionState}
            rows={2}
            // 16px below sm, else iOS Safari zooms when writing a comment.
            className="w-full rounded-lg border border-grey-200 dark:border-grey-700 bg-transparent px-3 py-2 text-sm max-sm:text-base outline-none focus:border-primary-500 resize-none text-foreground placeholder:text-grey-400"
            placeholder={
              replyToId
                ? 'Antwort schreiben...'
                : boardId
                  ? 'Kommentar schreiben... (@erwähnen)'
                  : 'Kommentar schreiben...'
            }
          />
          {commentText.trim() && (
            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleSubmit}
                disabled={addComment.isPending}
              >
                <FiSend className="mr-1" size={11} />
                {replyToId ? 'Antworten' : 'Senden'}
              </Button>
            </div>
          )}
        </div>

        <UserMentionPopover
          boardId={boardId}
          query={mentionQuery ?? ''}
          visible={mentionQuery !== null}
          anchorRect={mentionAnchor}
          onSelect={handleMentionSelect}
          onDismiss={() => setMentionQuery(null)}
          selectedIndex={mentionIndex}
        />
      </div>
    </div>
  );
});
