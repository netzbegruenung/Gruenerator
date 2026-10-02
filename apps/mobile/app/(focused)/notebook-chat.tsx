import { Redirect, useLocalSearchParams } from 'expo-router';

import { routeWithParams } from '../../types/routes';

/**
 * The notebook chat moved under its notebook (`/notebook/<id>/chat`, #4017).
 * This path stays forever: shipped binaries, OTA-updated apps and links still
 * open it.
 */
export default function LegacyNotebookChatRoute() {
  const { notebookId, threadId, initialMessage, title } = useLocalSearchParams<{
    notebookId: string;
    threadId?: string;
    initialMessage?: string;
    title?: string;
  }>();
  return (
    <Redirect
      href={routeWithParams('/notebook/[id]/chat', {
        id: notebookId,
        ...(threadId && { threadId }),
        ...(initialMessage && { initialMessage }),
        ...(title && { title }),
      })}
      withAnchor
    />
  );
}
