/**
 * Restore the text of earlier user messages that reached us empty.
 *
 * Measured on test, 13.08.2026 23:20–23:23 (`[Agentic] turn material`):
 *
 * ```
 * Turn 1: 1 msgs [u10256]
 * Turn 2: 3 msgs [u0 a2055 u613]
 * Turn 3: 5 msgs [u0 a2055 u0 a320 u714]
 * ```
 *
 * Every user message except the newest arrives with zero characters. The model
 * sees its own answers but not one question that produced them.
 *
 * Why: a message whose content rode in a file part (the composer turns a large
 * paste into a text attachment and sends the textarea empty) keeps no text part.
 * `sanitizeUIFileParts` drops the url-less file part before conversion — right,
 * because those bytes are carried in `attachments` — and for the CURRENT turn the
 * paste-promotion puts the text back. Historical messages get neither: the client
 * replays them from its own state, where the attachment is a preview only.
 *
 * The persisted row is intact (`chat_messages.content` held all 10.327 chars), so
 * the repair is to read it back rather than to change what the client sends.
 */
import { extractTextContent } from './messageHelpers.js';

import type { ModelMessage } from 'ai';

/**
 * Fill empty user messages from `persistedTexts` (oldest first, the current turn
 * NOT included — it is persisted after this runs).
 *
 * Aligned from the END: the client may replay a suffix of the thread, never a
 * prefix, so the newest persisted texts are the ones that correspond. A shorter
 * persisted list simply fills fewer messages — misalignment would put someone
 * else's question under this one, which is worse than an empty message.
 *
 * Returns how many messages were filled.
 */
export function backfillEmptyUserMessages(
  messages: ModelMessage[],
  persistedTexts: string[]
): number {
  // The last user message is this turn's own; it always carries its text (or is
  // about to get it from the paste promotion) and is not persisted yet.
  const indices: number[] = [];
  messages.forEach((m, i) => {
    if (m.role === 'user') indices.push(i);
  });
  const prior = indices.slice(0, -1);
  if (prior.length === 0) return 0;

  const offset = persistedTexts.length - prior.length;

  // Consistency check before writing anything: every prior message that DOES
  // carry text must match the row it aligns to. If one disagrees, the two lists
  // describe different turns (edit-resubmit, a deleted message, a client replaying
  // something else) and filling would put someone's earlier question under this
  // one. An empty message is a bad answer; the wrong question is a wrong answer.
  const aligned = prior.every((messageIndex, position) => {
    const text = extractTextContent(messages[messageIndex]?.content ?? '');
    if (text.length === 0) return true;
    const persisted = persistedTexts[offset + position];
    return persisted === undefined || persisted.startsWith(text.slice(0, 200));
  });
  if (!aligned) return 0;

  let filled = 0;
  prior.forEach((messageIndex, position) => {
    const message = messages[messageIndex];
    if (!message || extractTextContent(message.content).length > 0) return;
    const text = persistedTexts[offset + position];
    if (!text) return;
    message.content = text;
    filled++;
  });
  return filled;
}
