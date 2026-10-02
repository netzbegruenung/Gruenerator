import { useEffect } from 'react';

import { goHome } from '../utils/navigation';

/**
 * A link to a path the app has no screen for — an old deep link, a web path
 * from a notification — lands at home instead of on expo-router's "Unmatched
 * route" page, which offers no way on in a release build.
 *
 * An effect, not a `<Redirect>`: that replaces, and on top of a running app it
 * would leave a second home on the root stack (see `goHome`).
 */
export default function NotFoundScreen() {
  useEffect(() => {
    goHome();
  }, []);
  return null;
}
