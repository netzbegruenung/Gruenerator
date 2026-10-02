import { Redirect } from 'expo-router';

import { route } from '../../types/routes';

/**
 * The old thread list. Threads are listed in the drawer now (#4025).
 * This path stays forever: shipped binaries and links may still open it.
 */
export default function LegacyAllThreadsRoute() {
  return <Redirect href={route('/start')} />;
}
