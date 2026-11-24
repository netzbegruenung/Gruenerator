import { Redirect } from 'expo-router';

import { routeWithParams } from '../../types/routes';

/**
 * The former Bild-Editor. Sharepics and KI-Bilder are made in the chat now, as
 * on web (`/studio/bild` leads to the chat there). This path stays forever:
 * shipped binaries and links may still open it.
 */
export default function LegacyBildEditorRoute() {
  return <Redirect href={routeWithParams('/(focused)/chat-conversation', { threadId: 'new' })} />;
}
