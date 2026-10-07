/**
 * Cloud files (@wolke / @connect) picked in a thread stay in that thread, like
 * local uploads do (#4112). Only the REFS are stored — never file contents: the
 * file is re-read from the provider on every turn, so the "no storage of file
 * contents" promise holds and a follow-up always sees the file's current state.
 *
 * Stored in `chat_threads.cloud_file_refs` (`getThreadCloudFiles` /
 * `setThreadCloudFiles` in threadPersistenceService), scoped to the thread
 * owner: a Wolke share link and a Nango connection belong to one person; a
 * collaborator's turn could not read the owner's files, and its ownership
 * filter would otherwise erase the owner's refs.
 */

import { connectFileRefSchema, wolkeFileRefSchema } from '@gruenerator/contracts';
import { z } from 'zod';

import type { ConnectFileRef, WolkeFileRef } from '../../../agents/langgraph/ChatGraph/types.js';

/** Per kind. Every carried file costs a download and an extraction per turn —
 *  the same bound `getThreadAttachments(threadId, 5)` puts on uploads. */
export const MAX_THREAD_CLOUD_FILES = 5;

const threadCloudFilesSchema = z.object({
  wolke: z.array(wolkeFileRefSchema).default([]),
  connect: z.array(connectFileRefSchema).default([]),
});

export interface ThreadCloudFiles {
  wolke: WolkeFileRef[];
  connect: ConnectFileRef[];
}

export const NO_CLOUD_FILES: ThreadCloudFiles = { wolke: [], connect: [] };

const wolkeKey = (f: WolkeFileRef) => `${f.shareLinkId}:${f.path}`;
const connectKey = (f: ConnectFileRef) => `${f.provider}:${f.fileId}`;

function newestFirst<T>(picked: T[], stored: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...picked, ...stored]) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out.slice(0, MAX_THREAD_CLOUD_FILES);
}

/** This turn's picks first (their names are fresh), then the thread's earlier
 *  picks; duplicates collapse, the oldest fall off past the cap. */
export function mergeThreadCloudFiles(
  stored: ThreadCloudFiles,
  picked: ThreadCloudFiles
): ThreadCloudFiles {
  return {
    wolke: newestFirst(picked.wolke, stored.wolke, wolkeKey),
    connect: newestFirst(picked.connect, stored.connect, connectKey),
  };
}

export function sameThreadCloudFiles(a: ThreadCloudFiles, b: ThreadCloudFiles): boolean {
  return (
    a.wolke.map(wolkeKey).join('\n') === b.wolke.map(wolkeKey).join('\n') &&
    a.connect.map(connectKey).join('\n') === b.connect.map(connectKey).join('\n')
  );
}

/** The stored column, or no files when it is empty or does not parse. */
export function parseThreadCloudFiles(raw: unknown): ThreadCloudFiles {
  if (!raw) return NO_CLOUD_FILES;
  try {
    const parsed = threadCloudFilesSchema.safeParse(
      typeof raw === 'string' ? JSON.parse(raw) : raw
    );
    return parsed.success ? parsed.data : NO_CLOUD_FILES;
  } catch {
    return NO_CLOUD_FILES;
  }
}
