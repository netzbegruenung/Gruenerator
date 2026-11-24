import { Redirect } from 'expo-router';

import { routeWithParams } from '../../types/routes';

/**
 * The old KI-Bild type picker. Sharepics and KI-Bilder are made in the chat now, as on web.
 * This path stays forever: shipped binaries and links may still open it.
 */
export default function LegacyKiBildgenerierungRoute() {
  return <Redirect href={routeWithParams('/(focused)/chat-conversation', { threadId: 'new' })} />;
}
