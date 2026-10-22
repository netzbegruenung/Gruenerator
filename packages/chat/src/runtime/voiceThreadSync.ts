import { ExportedMessageRepository, type ThreadMessageLike } from '@assistant-ui/core';

import { type ChatApiClient } from '../context/ChatContext';

import { splitLiveTurn } from './resumableStream';

/** The part of a thread runtime a voice call writes through. */
export interface VoiceSyncThread {
  export(): ExportedMessageRepository;
  import(repository: ExportedMessageRepository): void;
}

/** A `/messages` row, as far as these two read it. */
type SavedRow = { id: string; role: string; content: unknown; metadata?: { live?: boolean } };

/** The platform's row converter — web and native each have their own. */
type ConvertRows<TRow> = (rows: TRow[]) => readonly ThreadMessageLike[];

/**
 * Puts a message the server saved during a voice call (a created sharepic,
 * document or board) into the running thread, after what was said so far.
 *
 * assistant-ui takes nothing but text while a call runs, so the card cannot
 * arrive as a tool result. Export, append and import happen in one
 * synchronous step: a transcript the call commits meanwhile lands before or
 * after the card, never on a branch the import throws away.
 */
export async function insertSavedMessage<TRow extends SavedRow>(
  getThread: () => VoiceSyncThread | null,
  apiClient: ChatApiClient,
  messagesUrl: string,
  messageId: string,
  convert: ConvertRows<TRow>
): Promise<void> {
  const rows = await apiClient.get<TRow[]>(messagesUrl);
  const row = rows.find((r) => r.id === messageId);
  const thread = getThread();
  if (!row || !thread) return;
  const repository = thread.export();
  if (repository.messages.some((item) => item.message.id === messageId)) return;
  const [item] = ExportedMessageRepository.fromArray(convert([row])).messages;
  if (!item) return;
  thread.import({
    ...repository,
    headId: item.message.id,
    messages: [...repository.messages, { ...item, parentId: repository.headId ?? null }],
  });
}

/**
 * The thread as the server has it, once a call is over: what a reload would
 * show, with the ids the server gave the spoken lines.
 */
export async function reloadSavedThread<TRow extends SavedRow>(
  getThread: () => VoiceSyncThread | null,
  apiClient: ChatApiClient,
  messagesUrl: string,
  convert: ConvertRows<TRow>
): Promise<void> {
  const rows = await apiClient.get<TRow[]>(messagesUrl);
  getThread()?.import(ExportedMessageRepository.fromArray(convert(splitLiveTurn(rows).rows)));
}
