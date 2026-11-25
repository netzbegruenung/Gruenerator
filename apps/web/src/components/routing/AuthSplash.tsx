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
 *
 * The chrome mirrors the real layout: from `md` the collapsed 56px sidebar
 * rail on the left, below `md` only the toggle spot top-left. There is no
 * top header bar in the app, so the skeleton draws none.
 *
 * The static shell in index.html mirrors this component 1:1 — change both.
 */
const AuthSplash = () => (
  <div
    className="fixed inset-0 z-50 flex bg-background"
    role="status"
    aria-live="polite"
    aria-label="Wird geladen"
  >
    {/* Sidebar rail (md+) / toggle spot (mobile) */}
    <div className="absolute left-0 top-0 flex w-14 flex-col items-center pt-sm md:static md:shrink-0">
      <Skeleton className="size-6" />
      <div className="mt-7 hidden flex-col items-center gap-5 md:flex">
        <Skeleton className="size-5" />
        <Skeleton className="size-5" />
        <Skeleton className="size-5" />
        <Skeleton className="size-5" />
        <Skeleton className="size-5" />
      </div>
    </div>

    {/* Main content */}
    <div className="min-w-0 flex-1 pt-12">
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
  </div>
);

export default AuthSplash;
