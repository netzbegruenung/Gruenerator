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

/**
 * Whether the collaborative Canvas-Editor (boards/docs/canvas) surfaces are
 * exposed. Still dev-only while it stabilises — gates e.g. the "Canvas-Editor
 * Vorlagen" section on /vorlagen/meine so it stays hidden in production.
 */
export const SHOW_CANVAS_EDITOR = import.meta.env.DEV;
