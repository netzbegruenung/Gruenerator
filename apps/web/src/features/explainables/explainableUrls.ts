import { resolveApiAssetUrl } from '@/utils/platform';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

/**
 * Where an explainable's binaries live. The owner reads by id behind the
 * session; a link visitor reads by share token, which works logged out.
 */
export type ExplainableAccess = { kind: 'owner'; id: string } | { kind: 'shared'; token: string };

function basePath(access: ExplainableAccess): string {
  return access.kind === 'owner'
    ? `/explainables/${access.id}`
    : `/explainables/shared/${access.token}`;
}

/** For `<img src>`: plain GET, so it needs the absolute API origin on desktop. */
export function explainableImageUrl(access: ExplainableAccess, sectionIndex: number): string {
  return resolveApiAssetUrl(`${API_BASE}${basePath(access)}/images/${sectionIndex}`);
}

/** Relative to the axios baseURL (which already ends in `/api`). */
export function explainablePdfPath(access: ExplainableAccess): string {
  return `${basePath(access)}/pdf`;
}

export function explainableShareUrl(origin: string, token: string): string {
  return `${origin}/e/${token}`;
}
