import { Redirect } from 'expo-router';

import { routeWithParams } from '../../../types/routes';

/**
 * Every step of the old Image Studio flow. Sharepics and KI-Bilder are made in the chat now, as on web.
 * This path stays forever: shipped binaries and links may still open it.
 */
export default function LegacyImageStudioCreateRoute() {
  return <Redirect href={routeWithParams('/(focused)/chat-conversation', { threadId: 'new' })} />;
}
