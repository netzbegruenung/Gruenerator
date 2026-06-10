/**
 * Build-time feature flags for the web app.
 */

/**
 * Whether the agent creator (conversational creator + manual builder + their
 * sidebar entry) is exposed. Available to everyone. Note this only gates the
 * creation/editing surface — `/agents/:slug` (chatting with an existing agent)
 * is always available.
 */
export const SHOW_AGENT_CREATOR = true;
