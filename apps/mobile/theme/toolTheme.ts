/**
 * A tool's colour identity — the mobile counterpart of web's
 * `apps/web/src/config/toolTheme.ts`, which drives the coloured square tiles on
 * the Arbeiten tab. Same pastel palette, same per-tool hue, expressed as plain
 * colour values because React Native has no Tailwind classes.
 *
 * Keys are tool ids from `components/tools/toolsConfig`. A tool without an entry
 * falls back to the neutral field in `getToolTheme`, so adding a tool never
 * crashes a tile — it just renders grey until it gets a hue here.
 *
 * Hues are taken over 1:1 from web wherever the tool exists on both platforms
 * (office, wissen, agents, projekte, vorlagen, ki-bild, reel). `scanner` and
 * `suche` have no web tile, so they borrow the palette's remaining free hues
 * (boards olive, "weitere" grey-green) rather than inventing new ones.
 */

export interface ToolTheme {
  /** Field colour of the square tile. */
  tile: string;
  icon: string;
  title: string;
  desc: string;
}

interface ToolThemePair {
  light: ToolTheme;
  dark: ToolTheme;
}

const TOOL_THEME: Record<string, ToolThemePair> = {
  agents: {
    light: { tile: '#F5EFC9', icon: '#7C6A1E', title: '#5F5212', desc: '#84743C' },
    dark: { tile: '#26220F', icon: '#CDBB72', title: '#E1D296', desc: '#AC9C68' },
  },
  projekte: {
    light: { tile: '#DCE6F2', icon: '#2E4E7A', title: '#1E3A5E', desc: '#56708F' },
    dark: { tile: '#14202E', icon: '#7CA2CB', title: '#A2C0E4', desc: '#6E88AB' },
  },
  scanner: {
    light: { tile: '#E6F0D6', icon: '#3E5A1E', title: '#31471A', desc: '#5E7440' },
    dark: { tile: '#202B14', icon: '#A6C57C', title: '#C4DAA2', desc: '#8DA66E' },
  },
  vorlagen: {
    light: { tile: '#DDEEEC', icon: '#1E4F49', title: '#193F3A', desc: '#456B66' },
    dark: { tile: '#142B28', icon: '#7CC5BC', title: '#A2DAD2', desc: '#6EA69E' },
  },
  'ki-bildgenerierung': {
    light: { tile: '#E9E7F2', icon: '#3E3663', title: '#332B54', desc: '#5F587E' },
    dark: { tile: '#1F1B2E', icon: '#A99ED1', title: '#C6BCE4', desc: '#8E86AB' },
  },
  reel: {
    light: { tile: '#F5DEE6', icon: '#8A3E5C', title: '#6E2E48', desc: '#9E6A80' },
    dark: { tile: '#2B1620', icon: '#CB8AA6', title: '#E4B0C6', desc: '#AB7E94' },
  },
};

const NEUTRAL: ToolThemePair = {
  light: { tile: '#F1F2F1', icon: '#4A554C', title: '#313A34', desc: '#5F6A61' },
  dark: { tile: '#1C211D', icon: '#9CA99F', title: '#C0CCC3', desc: '#8A968C' },
};

export function getToolTheme(toolId: string, isDark: boolean): ToolTheme {
  const pair = TOOL_THEME[toolId] ?? NEUTRAL;
  return isDark ? pair.dark : pair.light;
}
