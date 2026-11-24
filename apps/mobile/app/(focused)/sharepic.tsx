import { Redirect, useLocalSearchParams } from 'expo-router';

import { routeWithParams } from '../../types/routes';

/**
 * The former sharepic chat. Sharepics are made in the chat now, as on web
 * (`/studio/freitext` leads to the chat there); a prompt that came along waits
 * in the composer. This path stays forever: shipped binaries still open it.
 */
export default function LegacySharepicRoute() {
  const { initialMessage } = useLocalSearchParams<{ initialMessage?: string }>();
  return (
    <Redirect
      href={routeWithParams('/(focused)/chat-conversation', {
        threadId: 'new',
        ...(initialMessage ? { initialComposerText: initialMessage } : {}),
      })}
    />
  );
}
