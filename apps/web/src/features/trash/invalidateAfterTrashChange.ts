import { type TrashKind } from '@gruenerator/contracts';
import { GROUPS_QUERY_KEY } from '@gruenerator/shared/groups';
import { MEDIA_LIBRARY_QUERY_KEY } from '@gruenerator/shared/media-library';
import { type QueryClient, type QueryKey } from '@tanstack/react-query';

import { BOARDS_QUERY_KEY } from '../../hooks/useBoardsTyped';
import { PUBLIC_GROUPS_QUERY_KEY } from '../groups/hooks/useGroupRequests';
import { LETTERHEADS_QUERY_KEY } from '../settings/letterheadApi';

const ALWAYS: readonly QueryKey[] = [['recent-activity'], ['content'], ['trash']];

/**
 * The caches that list a kind's live items, invalidated after a restore puts one
 * back. Prefix keys: `['notebookCollections']` covers own, shared and public.
 *
 * Empty on purpose:
 * - `chat_thread`: the thread list lives in the chat runtime, not in TanStack;
 *   its reload hook arrives separately.
 * - `custom_prompt`: the prompt list is read by `mentionableSync` (packages/chat)
 *   outside TanStack, so there is no query to invalidate.
 */
const BY_KIND: Record<TrashKind, readonly QueryKey[]> = {
  collaborative_document: [['documents', 'list'], BOARDS_QUERY_KEY, ['canvas', 'list']],
  chat_thread: [],
  notebook: [['notebookCollections'], ['notebook', 'collection']],
  document: [['notebook', 'collection']],
  shared_media: [MEDIA_LIBRARY_QUERY_KEY],
  subtitler_project: [['subtitler-beta', 'projects']],
  user_agent: [['user-agents']],
  user_template: [['userTemplates'], ['profileData']],
  user_text_form: [['text-forms']],
  custom_prompt: [],
  user_site: [['user-websites']],
  recurring_task: [['recurring-tasks']],
  user_letterhead: [LETTERHEADS_QUERY_KEY],
  user_document: [['userTexts']],
  user_knowledge: [['anweisungenWissen']],
  group: [GROUPS_QUERY_KEY, PUBLIC_GROUPS_QUERY_KEY],
};

/** `kind: null` — a change across kinds (emptying the trash) touches only the shared lists. */
export function invalidateAfterTrashChange(qc: QueryClient, kind: TrashKind | null): void {
  const keys = kind ? [...ALWAYS, ...BY_KIND[kind]] : ALWAYS;
  for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
}
