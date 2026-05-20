import { Skeleton } from '@gruenerator/ui';

/**
 * Page skeleton shown while the auth-bootstrap window is open (before
 * /auth/status has answered for the first time this page load).
 *
 * Deliberately content-agnostic — we don't yet know whether the user is
 * logged in, so the skeleton must work for both the eventual Startseite
 * AND the eventual /workplace. Showing a "Login" button would teach
 * guests-who-are-actually-authenticated to click it unnecessarily, which
 * is the exact bug this whole change is fixing.
 */
const AuthSplash = () => (
  <div
    className="fixed inset-0 z-50 flex flex-col bg-background"
    role="status"
    aria-live="polite"
    aria-label="Wird geladen"
  >
    {/* Header bar */}
    <div className="flex items-center justify-between border-b border-border px-md py-sm">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-8 w-8 rounded-full" />
    </div>

    {/* Main content */}
    <div className="mx-auto mt-xl w-full max-w-3xl px-md flex flex-col gap-md">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-lg h-32 w-full" />
      <div className="mt-md grid grid-cols-1 gap-md md:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  </div>
);

export default AuthSplash;
