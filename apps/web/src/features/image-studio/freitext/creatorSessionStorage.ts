/**
 * The storage slot of the sharepic creator session, without its schema.
 * authStore clears it on logout at boot; importing creatorSession.ts there
 * pulled the sharepic zod schemas into the entry's static closure (#5891).
 *
 * One slot for the whole browser: the next account's session overwrites it,
 * and a session is only handed to the account that wrote it.
 */
export const CREATOR_SESSION_STORAGE_KEY = 'gruenerator-sharepic-creator-v1';

export function clearCreatorSession(): void {
  try {
    localStorage.removeItem(CREATOR_SESSION_STORAGE_KEY);
  } catch {
    /* blocked storage */
  }
}
