/**
 * Gate: Parteitage are visible only to instance admins for now.
 * admin only until the system-media volume is live (Salt #5527).
 * Set to false (or delete this file and its use in access.ts) to open the feature up.
 * Non-admins get the same answer as for a missing convention (404), so it stays invisible.
 */
export const PARTEITAGE_ADMIN_ONLY = true;
