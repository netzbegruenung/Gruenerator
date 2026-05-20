import { useAuth } from '../../hooks/useAuth';

/**
 * Mounts the canonical `useAuth` query once at the App root so that
 * `/auth/status` is fetched on every page load — regardless of which route
 * the user lands on.
 *
 * Why this is needed: `useAuth` is otherwise called ad-hoc inside specific
 * feature pages (workplace, profile, media-library, …). If the user lands
 * directly on `/` (Startseite), no caller exists and the query never fires
 * — which would leave `hasBootstrapped` permanently false and hang the
 * AuthSplash forever.
 *
 * React Query dedupes by queryKey, so the in-page `useAuth` callers join
 * this singleton query rather than firing duplicates.
 *
 * `instant: true` seeds the store synchronously from the instant-auth
 * cache when present — keeping the splash invisible on the common path.
 */
const AuthBootstrap = () => {
  useAuth({ instant: true });
  return null;
};

export default AuthBootstrap;
