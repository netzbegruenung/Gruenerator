/**
 * Shared class fragments for the redesigned monitor pages (Themen/Umfragen).
 * A calm editorial forest-green palette from the Claude-Design import, with
 * dark-mode variants added (the source design was light-only). Kept as literal
 * Tailwind strings so the JIT keeps the arbitrary-value classes.
 */

/** Card surface (hero + section panels). */
export const MONITOR_CARD =
  'rounded-2xl border border-[#e2eae5] bg-white shadow-[0_6px_20px_rgba(49,96,73,0.06)] dark:border-grey-700/60 dark:bg-grey-900/40 dark:shadow-none';

/** Smaller tile surface (ranking/bluesky tiles) with a hover border lift. */
export const MONITOR_TILE =
  'rounded-2xl border border-[#e2eae5] bg-white shadow-[0_3px_12px_rgba(49,96,73,0.04)] transition-colors hover:border-[#b9d0c5] dark:border-grey-700/60 dark:bg-grey-900/40 dark:shadow-none dark:hover:border-grey-600';

export const MONITOR_EYEBROW =
  'text-[12px] font-bold uppercase tracking-[0.14em] text-[#52907a] dark:text-[#7fae9c]';
export const MONITOR_HEADING = 'text-[#22382e] dark:text-grey-100';
export const MONITOR_BODY = 'text-[#3a4a42] dark:text-grey-300';
export const MONITOR_MUTED = 'text-[#5c6b63] dark:text-grey-400';
export const MONITOR_FAINT = 'text-[#8b978f] dark:text-grey-500';
export const MONITOR_ACCENT = 'text-[#316049] dark:text-[#6fae90]';

/** Neutral green chip (topic/category pill). */
export const MONITOR_CHIP =
  'rounded-full bg-[#eef4f1] px-2.5 py-0.5 text-[12px] font-bold text-[#316049] dark:bg-[#1e2f27] dark:text-[#8fc3a9]';

/** Keyword/tag pill inside ranking tiles. */
export const MONITOR_TAG =
  'rounded-full bg-[#f2f6f3] px-2.5 py-[3px] text-[13px] font-semibold text-[#5c6b63] dark:bg-grey-800/60 dark:text-grey-300';

/** Rounded pill-toggle track (DE/AT, Bundesländer/Europa). */
export const MONITOR_PILL_TRACK =
  'flex items-center gap-1 rounded-full bg-[#eef4f1] p-1 dark:bg-grey-800/60';
