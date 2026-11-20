import { type ComponentType } from 'react';

import NotFound from '../components/pages/NotFound';
import { useAuthStore } from '../stores/authStore';

import { type ToolId } from './toolRegistry';

/**
 * The one web gate for tools that are visible only to instance admins for now:
 * tile, search entry and routes. The server holds the real gate where the tool
 * has an API. To open a tool up, drop its row here and unwrap its routes.
 *
 * - `parteitage`: until the system-media volume is live (Salt #5527); API gate
 *   `PARTEITAGE_ADMIN_ONLY` in `services/parteitage/adminOnlyGate.ts`.
 * - `studio-ki-schnitt`: test phase; API gate `requireInstanceAdminMiddleware`
 *   on `/api/video-ai` in `routes.ts`.
 */
const ADMIN_ONLY_TOOLS = [
  { id: 'parteitage', path: '/parteitage' },
  { id: 'studio-ki-schnitt', path: '/studio/ki-schnitt' },
] as const satisfies readonly { id: ToolId; path: string }[];

export const isAdminOnlyTool = (id: string): boolean => ADMIN_ONLY_TOOLS.some((t) => t.id === id);

export const isAdminOnlyPath = (path: string): boolean =>
  ADMIN_ONLY_TOOLS.some((t) => path === t.path || path.startsWith(`${t.path}/`));

/** Strict `=== true`: a missing field on a stale persisted user means "no". */
export const useCanSeeAdminTools = (): boolean => useAuthStore((s) => s.user?.is_admin === true);

/** Wraps an admin-only page: everyone else gets the normal not-found page. */
export function withAdminToolGate<P extends object>(Page: ComponentType<P>) {
  const Gated = (props: P) => {
    const allowed = useCanSeeAdminTools();
    return allowed ? <Page {...props} /> : <NotFound />;
  };
  return Gated;
}
