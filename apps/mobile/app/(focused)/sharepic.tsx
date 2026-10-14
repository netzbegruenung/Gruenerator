import { Redirect, useLocalSearchParams } from 'expo-router';

import { SharepicCreatorScreen } from '../../components/image-studio/sharepic/SharepicCreatorScreen';
import { routeWithParams } from '../../types/routes';

/**
 * The sharepic chat starts in the Bild-Editor, like web's `/studio/freitext`:
 * opened without a prompt (the Sharepic tile, an old link), it sends the person
 * there in „Sharepic" mode. The path stays — shipped binaries still open it.
 */
export default function SharepicRoute() {
  const { initialMessage } = useLocalSearchParams<{ initialMessage?: string }>();
  if (!initialMessage) {
    return <Redirect href={routeWithParams('/(focused)/bild-editor', { mode: 'sharepic' })} />;
  }
  return <SharepicCreatorScreen initialMessage={initialMessage} />;
}
