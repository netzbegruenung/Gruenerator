/**
 * Shared state + helpers for the split groups contract router.
 *
 * The handler modules (discovery / core / content) import the `s` server
 * instance, the membership/error helpers, and the ported content-sharing lookup
 * tables from here; `index.ts` composes the route objects into one ts-rest
 * router. Splitting keeps each handler module focused while `s.route(...)`
 * preserves full per-route type inference across files.
 */

import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { initServer } from '@ts-rest/express';

import { createLogger } from '../../../../utils/logger.js';

import type { UserProfile } from '../../../../services/user/types.js';
import type { Request } from 'express';

export const s = initServer();

export const log = createLogger('groupsContractRouter');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const AVATAR_UPLOAD_DIR = path.join(__dirname, '../../../../uploads/group-avatars');

export interface StoredGroupLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  icon: string;
}

/** Map a membership/permission throw to 403, anything else to 500. */
function isPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('Mitglied') || msg.includes('Berechtigung') || msg.includes('Admin');
}

/**
 * Shared error tail for membership-gated handlers: a permission throw becomes a
 * 403 (with the thrown message), anything else is logged and becomes a 500.
 * Every gated route declares both 403 and 500 with `groupErrorResponseSchema`,
 * so this union is assignable in each handler.
 */
export function groupErrorResponse(
  handler: string,
  message500: string,
  error: unknown
):
  | { status: 403; body: { success: false; message: string } }
  | { status: 500; body: { success: false; message: string } } {
  if (isPermissionError(error)) {
    return { status: 403, body: { success: false, message: (error as Error).message } };
  }
  log.error(`[groupsContract.${handler}] Error:`, error);
  return { status: 500, body: { success: false, message: message500 } };
}

export function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) {
    throw new Error('Authentication required');
  }
  return user.id;
}

export function getUserLocale(req: Request): 'de-DE' | 'de-AT' {
  const user = req.user as UserProfile | undefined;
  return user?.locale === 'de-AT' ? 'de-AT' : 'de-DE';
}

export interface DiscoverRow {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  member_count: number | string;
  audience: 'de-DE' | 'de-AT' | 'all';
  request_status: 'pending' | 'approved' | 'denied' | null;
}

export interface JoinRequestRow {
  id: string;
  group_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'denied';
  requested_at: string | Date;
  display_name: string | null;
  first_name: string | null;
  email: string | null;
  avatar_robot_id: number | null;
}
