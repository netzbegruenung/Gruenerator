import { getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { Button } from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useRef, useState } from 'react';
import { FiSend, FiCornerDownRight, FiMessageSquare } from 'react-icons/fi';
import { useParams } from 'react-router-dom';

import apiClient from '../../../components/utils/apiClient';

import { UserMentionPopover, type MentionUser } from './UserMentionPopover';

import type { ReactNode } from 'react';

// ── Types ────────────────────────────────────────────────────────────────

interface CommentBlock {
  type: 'text' | 'mention' | 'link' | 'code';
  text?: string;
  userId?: string;
  displayName?: string;
}

interface Reaction {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
}

interface Comment {
  id: string;
  board_id: string;
  card_id: string;
  parent_id: string | null;
  user_id: string;
  content: string | null;
  blocks: CommentBlock[];
  is_edited: boolean;
  created_at: string;
  author_name: string | null;
  author_avatar_robot_id: number | null;
  reply_count: number;
  reactions: Reaction[];
  replies: Comment[];
}

// ── Tracked mention (position in text) ──────────────────────────────────

interface TrackedMention {
  start: number;
  end: number;
  userId: string;
  displayName: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const REACTION_EMOJI = ['👍', '❤️', '🎉', '👀', '🚀', '💡'];

function formatCommentDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `vor ${diffD} ${diffD === 1 ? 'Tag' : 'Tagen'}`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
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
  return blocks.map((block, i) => {
    if (block.type === 'mention') {
      return (
        <span key={i} className="text-primary-600 dark:text-primary-400 font-medium">
          @{block.displayName}
        </span>
      );
    }
    return <span key={i}>{block.text}</span>;
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

// ── Reaction summary ────────────────────────────────────────────────────

function groupReactions(reactions: Reaction[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of reactions) {
    const arr = map.get(r.emoji) ?? [];
    arr.push(r.user_id);
    map.set(r.emoji, arr);
  }
  return map;
}

// ── Single comment ──────────────────────────────────────────────────────

interface CommentItemProps {
  comment: Comment;
  currentUserId: string;
  currentUserAvatarRobotId: number;
  boardId: string;
  isReply?: boolean;
  onReply?: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
}

const CommentItem = memo(function CommentItem({
  comment,
  currentUserId,
  isReply,
  onReply,
  onDelete,
  onToggleReaction,
}: CommentItemProps) {
  const [showReactions, setShowReactions] = useState(false);
  const grouped = groupReactions(comment.reactions);

  return (
    <div className={`flex gap-2 group ${isReply ? 'ml-8' : ''}`}>
      <img
        src={getRobotAvatarPath(comment.author_avatar_robot_id ?? 1)}
        alt=""
        className="w-6 h-6 rounded-full shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground">
            {comment.author_name ?? 'Unbekannt'}
          </span>
          <span className="text-[10px] text-grey-400">{formatCommentDate(comment.created_at)}</span>
          {comment.is_edited && <span className="text-[10px] text-grey-400">(bearbeitet)</span>}
          <div className="sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-0.5 ml-auto transition-opacity">
            {!isReply && onReply && (
              <button
                onClick={() => onReply(comment.id)}
                className="text-grey-400 hover:text-primary-600 bg-transparent border-none cursor-pointer text-[10px] p-1 sm:p-0"
                title="Antworten"
              >
                <FiCornerDownRight size={12} />
              </button>
            )}
            <button
              onClick={() => setShowReactions((v) => !v)}
              className="text-grey-400 hover:text-primary-600 bg-transparent border-none cursor-pointer text-[10px] p-1 sm:p-0"
              title="Reagieren"
            >
              😀
            </button>
            {comment.user_id === currentUserId && (
              <button
                onClick={() => onDelete(comment.id)}
                className="text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer text-[10px] p-1 sm:p-0"
                title="Löschen"
              >
                &times;
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-foreground m-0 mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
          {renderBlocks(comment.blocks)}
        </p>

        {showReactions && (
          <div className="flex gap-1 mt-1">
            {REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onToggleReaction(comment.id, emoji);
                  setShowReactions(false);
                }}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer text-sm transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {grouped.size > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {Array.from(grouped.entries()).map(([emoji, userIds]) => {
              const hasOwn = userIds.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction(comment.id, emoji)}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors cursor-pointer bg-transparent ${
                    hasOwn
                      ? 'border-primary-300 dark:border-primary-600 text-primary-600 dark:text-primary-400'
                      : 'border-grey-200 dark:border-grey-700 text-grey-500'
                  }`}
                >
                  <span>{emoji}</span>
                  <span>{userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

// ── Main component ──────────────────────────────────────────────────────

interface CardCommentsProps {
  cardId: string;
  groupId?: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatarRobotId: number;
}

export const CardComments = memo(function CardComments({
  cardId,
  groupId,
  currentUserId,
  currentUserName,
  currentUserAvatarRobotId,
}: CardCommentsProps) {
  const { id: boardId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [commentText, setCommentText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [trackedMentions, setTrackedMentions] = useState<TrackedMention[]>([]);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTriggerPos, setMentionTriggerPos] = useState(0);
  const [mentionAnchor, setMentionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const queryKey = ['board-comments', boardId, cardId];

  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!boardId) return [];
      const res = await apiClient.get<Comment[]>(
        `/board-comments/${boardId}/cards/${cardId}/comments`
      );
      return res.data;
    },
    enabled: !!boardId && !!cardId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: async ({ blocks, parentId }: { blocks: CommentBlock[]; parentId?: string }) => {
      const res = await apiClient.post<Comment>(
        `/board-comments/${boardId}/cards/${cardId}/comments`,
        { blocks, parentId }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setCommentText('');
      setReplyToId(null);
      setTrackedMentions([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiClient.delete(`/board-comments/${boardId}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async ({
      commentId,
      emoji,
      remove,
    }: {
      commentId: string;
      emoji: string;
      remove: boolean;
    }) => {
      if (remove) {
        await apiClient.delete(
          `/board-comments/${boardId}/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`
        );
      } else {
        await apiClient.post(`/board-comments/${boardId}/comments/${commentId}/reactions`, {
          emoji,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // ── Mention handling ────────────────────────────────────────────────

  const updateMentionState = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !groupId) {
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
  }, [groupId]);

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
    [mentionQuery]
  );

  // ── Submit ──────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    const blocks = parseTextToBlocks(trimmed, trackedMentions);
    addMutation.mutate({ blocks, parentId: replyToId ?? undefined });
  }, [commentText, trackedMentions, replyToId, addMutation]);

  const handleToggleReaction = useCallback(
    (commentId: string, emoji: string) => {
      const allComments = comments.flatMap((c) => [c, ...c.replies]);
      const comment = allComments.find((c) => c.id === commentId);
      const hasOwn = comment?.reactions.some(
        (r) => r.user_id === currentUserId && r.emoji === emoji
      );
      reactionMutation.mutate({ commentId, emoji, remove: !!hasOwn });
    },
    [comments, currentUserId, reactionMutation]
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
                onReply={setReplyToId}
                onDelete={(id) => deleteMutation.mutate(id)}
                onToggleReaction={handleToggleReaction}
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
                      isReply
                      onDelete={(id) => deleteMutation.mutate(id)}
                      onToggleReaction={handleToggleReaction}
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
        <img
          src={getRobotAvatarPath(currentUserAvatarRobotId)}
          alt=""
          className="w-6 h-6 rounded-full shrink-0 mt-1"
        />
        <div className="flex-1 flex flex-col gap-1.5">
          <textarea
            ref={textareaRef}
            value={commentText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onSelect={updateMentionState}
            rows={2}
            className="w-full rounded-lg border border-grey-200 dark:border-grey-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary-500 resize-none text-foreground placeholder:text-grey-400"
            placeholder={
              replyToId
                ? 'Antwort schreiben...'
                : groupId
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
                disabled={addMutation.isPending}
              >
                <FiSend className="mr-1" size={11} />
                {replyToId ? 'Antworten' : 'Senden'}
              </Button>
            </div>
          )}
        </div>

        <UserMentionPopover
          groupId={groupId}
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
