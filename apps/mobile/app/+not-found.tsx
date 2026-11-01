import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * A link to a path the app has no screen for — an old deep link, a web path
 * from a notification — lands at home instead of on expo-router's "Unmatched
 * route" page, which offers no way on in a release build.
 *
 * An effect, not a `<Redirect>`: that replaces, and on top of a running app it
 * would leave a second home on the root stack (see `goHome`).
 *
 * The hook-bound router, not the imported `router`: since expo-router 58 the
 * imported one is bound by a layout effect that can run after this screen's
 * effect on a cold link, and then throws "unavailable before the first render".
 * `dismissTo` is the same call `goHome` makes.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  useEffect(() => {
    router.dismissTo('/start');
  }, [router]);
  return null;
}
