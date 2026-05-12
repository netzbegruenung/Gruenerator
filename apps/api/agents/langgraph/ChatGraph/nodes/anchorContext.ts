import type { ChatGraphState } from '../types.js';

/**
 * Descriptor for a single populated state anchor (open document, referenced
 * docs, board, file/image attachments, doc-chat scope). Single source of truth
 * for "which contexts the user attached" — consumed by the classifier (to
 * resolve anaphoric references in the search query) and by respondNode (to
 * emit composable prompt adjuncts).
 */
export type AnchorDescriptor =
  | { kind: 'currentDocument'; title: string }
  | { kind: 'documentMention'; titles: string[] }
  | { kind: 'documentChat' }
  | { kind: 'board' }
  | { kind: 'attachment' }
  | { kind: 'image'; names: string[] };

const DOC_MENTION_TITLE_RE = /^### (.+)$/gm;
const MAX_DOC_MENTION_TITLES = 5;

export function getActiveAnchors(state: ChatGraphState): AnchorDescriptor[] {
  const anchors: AnchorDescriptor[] = [];

  if (state.currentDocument?.title) {
    anchors.push({ kind: 'currentDocument', title: state.currentDocument.title });
  }

  if (state.documentMentionContext) {
    const titles: string[] = [];
    for (const m of state.documentMentionContext.matchAll(DOC_MENTION_TITLE_RE)) {
      const t = m[1].trim();
      if (t) titles.push(t);
      if (titles.length >= MAX_DOC_MENTION_TITLES) break;
    }
    if (titles.length > 0) anchors.push({ kind: 'documentMention', titles });
  }

  if (state.documentChatIds && state.documentChatIds.length > 0) {
    anchors.push({ kind: 'documentChat' });
  }
  if (state.boardContext) anchors.push({ kind: 'board' });
  if (state.attachmentContext) anchors.push({ kind: 'attachment' });
  if (state.imageAttachments && state.imageAttachments.length > 0) {
    anchors.push({ kind: 'image', names: state.imageAttachments.map((i) => i.name) });
  }

  return anchors;
}
