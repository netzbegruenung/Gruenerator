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

/**
 * Sharepic creation (the canvas template flow under /studio/:category) as a
 * public RESEARCH PREVIEW. On in prod, accompanied by a dismissible warning
 * banner; flip to `false` to instantly fall back to the read-only gallery
 * preview. Decoupled from SHOW_CANVAS_EDITOR, which gates the separate
 * boards/docs collaborative canvas.
 */
export const SHOW_SHAREPIC_STUDIO = true;

/**
 * EXPERIMENTAL — the recurring agent tasks ("Wiederkehrende Aufgabe") management
 * surface. Off by default; the backend is gated by RECURRING_TASKS_ENABLED. Uses
 * an env override so it can be flipped on test without a code change.
 */
export const SHOW_RECURRING_TASKS = import.meta.env.VITE_SHOW_RECURRING_TASKS === 'true';
