/**
 * Which glyph each navigable tool wears, as a platform-neutral key.
 *
 * The same split the settings catalog and the Agentura shelves use: identity is
 * shared, rendering is not. Web draws these with `react-icons`, mobile with the
 * mirrored SVG paths in `components/icons/WebMirrorIcons.tsx` — but *which*
 * glyph a tool gets is one decision, and it belongs in one file.
 *
 * It was three files before this: web's `toolRegistry` said the Agentura wears a
 * spy, web's `icons.ts` navigation map said Projekte wears a user group, and
 * mobile's `toolsConfig` independently named Ionicons look-alikes. The mobile
 * drawer accordingly showed a pair of silhouettes where web shows a spy — nobody
 * had decided that, the two lists had simply never been the same list.
 *
 * Keys name the glyph, not the tool, so two tools can share one and the mapping
 * below stays the only place a tool's icon is chosen.
 */
export type ToolIconKey = 'spy' | 'userGroup' | 'scan' | 'paintBrush' | 'magic' | 'videoCamera';

/**
 * Tool id → glyph. Ids are the shared ones (F1-frozen on mobile, where
 * `useToolFavoritesStore` persists them).
 */
export const TOOL_ICON_KEYS = {
  agents: 'spy',
  projekte: 'userGroup',
  scanner: 'scan',
  vorlagen: 'paintBrush',
  'ki-bildgenerierung': 'magic',
  reel: 'videoCamera',
} as const satisfies Record<string, ToolIconKey>;

export type ToolIconId = keyof typeof TOOL_ICON_KEYS;

export function toolIconKey(id: ToolIconId): ToolIconKey {
  return TOOL_ICON_KEYS[id];
}
