import { env } from '../config/env.js';

const adminEmailsSet: ReadonlySet<string> = new Set(
  (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function isAdminByEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmailsSet.has(email.toLowerCase());
}
