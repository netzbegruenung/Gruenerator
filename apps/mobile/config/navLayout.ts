/**
 * Which app shell mobile runs.
 *
 * - `workplace`: web's layout — two pills top centre (Chat | Arbeiten), no
 *   bottom tab bar, the chat composer docked at the bottom of the Chat tab, and
 *   Studio and Wissen folded into Arbeiten (as sections and a tile).
 * - `tabs`: the four-tab bottom bar (Chat, Arbeiten, Studio, Wissen).
 *
 * A code constant rather than a setting: this is a design decision for everyone,
 * not a per-user preference. The `tabs` shell is kept whole so going back is a
 * one-line change plus an OTA update.
 */
export const NAV_LAYOUT = 'workplace' as 'workplace' | 'tabs';

export const isWorkplaceLayout = NAV_LAYOUT === 'workplace';
