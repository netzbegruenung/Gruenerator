/**
 * Build-time feature flags for the web app.
 */

/**
 * Whether the agent creator (conversational creator + manual builder + their
 * sidebar entry) is exposed. Hidden in production by default; shown in dev, or
 * on a deploy that sets `VITE_SHOW_AGENT_CREATOR=true`. Note this only gates the
 * creation/editing surface — `/agents/:slug` (chatting with an existing agent)
 * is always available.
 */
export const SHOW_AGENT_CREATOR =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_AGENT_CREATOR === 'true';
