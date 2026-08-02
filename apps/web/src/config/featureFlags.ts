/**
 * Feature flags for the web app.
 *
 * Flags that gate unfinished work go through the instance's channels rather
 * than `import.meta.env.DEV`, so a future preview instance can carry them
 * without a separate build.
 */
import { isChannelVisibleIn } from '@gruenerator/shared/instances';

import { CURRENT_INSTANCE } from './instance';

/**
 * Whether the agent creator (conversational creator + manual builder + their
 * sidebar entry) is exposed. Available to everyone. Note this only gates the
 * creation/editing surface — `/agents/:slug` (chatting with an existing agent)
 * is always available.
 */
export const SHOW_AGENT_CREATOR = true;

/**
 * Whether the collaborative Canvas-Editor (boards/docs/canvas) surfaces are
 * exposed. Still `internal` while it stabilises — gates e.g. the "Canvas-Editor
 * Vorlagen" section on /vorlagen/meine so it stays hidden outside development.
 */
export const SHOW_CANVAS_EDITOR = isChannelVisibleIn('internal', CURRENT_INSTANCE);

/**
 * Sharepic creation (the canvas template flow under /studio/:category) as a
 * public RESEARCH PREVIEW. On in prod, accompanied by a dismissible warning
 * banner; flip to `false` to instantly fall back to the read-only gallery
 * preview. Decoupled from SHOW_CANVAS_EDITOR, which gates the separate
 * boards/docs collaborative canvas.
 */
export const SHOW_SHAREPIC_STUDIO = true;
