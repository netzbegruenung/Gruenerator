/**
 * Git commit this bundle was built from (short SHA), injected as
 * VITE_APP_COMMIT by the Docker image build; 'dev' in local dev servers.
 * Diagnostic logs (sharepic handoff, canvas mint) stamp it so a stale or
 * mixed deployment — chat tab and studio tab served from different builds —
 * is immediately visible in the console.
 */
export const APP_COMMIT: string = import.meta.env.VITE_APP_COMMIT ?? 'dev';
