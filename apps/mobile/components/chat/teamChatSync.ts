import { ExportedMessageRepository, type ThreadMessageLike } from '@assistant-ui/react-native';

/** The part of a thread runtime the poll reads and writes. */
export interface TeamSyncThread {
  getState(): {
    isRunning: boolean;
    messages: readonly { status?: { type: string; reason?: string } }[];
  };
  import(repository: ExportedMessageRepository): void;
}

/** A `/messages` row, as far as the poll reads it. */
export interface TeamSyncRow {
  id: string;
  role: string;
  content: unknown;
  metadata?: { live?: boolean } | null;
}

/** How often an open team chat asks the server for news. */
export const TEAM_CHAT_POLL_MS = 5000;

/**
 * Changes whenever a row appears, disappears or its text changes (a peer's
 * answer finishing keeps its id but grows its content).
 */
export function rowsSignature(rows: readonly TeamSyncRow[]): string {
  return rows
    .map(
      (r) =>
        `${r.id}:${r.role}:${JSON.stringify(r.content ?? '').length}:${r.metadata?.live ? 1 : 0}`
    )
    .join('|');
}

/**
 * One poll of a team chat. Imports the server's rows only when they differ from
 * what the last poll saw, and never while this device is itself streaming (the
 * import would replace the answer in progress). `import` REPLACES the thread
 * with the canonical rows, so a message can never appear twice. A still-running
 * peer answer (`metadata.live`) is held back until its row is final.
 *
 * Returns the signature to compare with next time: the new one after an
 * import, the old one when nothing was done.
 */
export function applyTeamChatRows<TRow extends TeamSyncRow>(args: {
  rows: readonly TRow[];
  thread: TeamSyncThread | null;
  lastSignature: string | null;
  convert: (rows: TRow[]) => readonly ThreadMessageLike[];
}): string | null {
  const { rows, thread, lastSignature, convert } = args;
  if (!thread || thread.getState().isRunning) return lastSignature;
  const signature = rowsSignature(rows);
  if (signature === lastSignature) return lastSignature;
  const settled = rows.filter((r) => !r.metadata?.live);
  // This device is ahead of the server: its last answer is not saved yet
  // (the server writes it after the stream), or it failed and was never saved
  // (a busy or error notice). Importing now would wipe it. A later poll
  // catches up once the server has the rows.
  const local = thread.getState().messages;
  if (
    local.length > settled.length ||
    local.some((m) => m.status?.type === 'incomplete' && m.status.reason === 'error')
  ) {
    return lastSignature;
  }
  thread.import(ExportedMessageRepository.fromArray(convert(settled)));
  return signature;
}
