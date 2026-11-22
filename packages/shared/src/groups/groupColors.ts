import { GROUP_COLORS, type GroupColor } from '@gruenerator/contracts';

/**
 * Tile palette for projects. The key set is the contracts enum (`groupColorSchema`);
 * the values live here so web and app render the same tiles. Every title/desc
 * colour reaches >= 4.5:1 on its tile background in both modes (checked with the
 * WCAG formula; `groupColors.vitest.ts` keeps it that way).
 */
export type { GroupColor };

export interface GroupColorTone {
  bg: string;
  title: string;
  desc: string;
}

export const GROUP_COLOR_STYLES: Record<
  GroupColor,
  { label: string; light: GroupColorTone; dark: GroupColorTone }
> = {
  gruen: {
    label: 'Grün',
    light: { bg: '#DDEFD9', title: '#1B4D1F', desc: '#3F6B43' },
    dark: { bg: '#15241A', title: '#A9D8AC', desc: '#7FAE84' },
  },
  tanne: {
    label: 'Tanne',
    light: { bg: '#D6EBE8', title: '#12504A', desc: '#34706A' },
    dark: { bg: '#112423', title: '#9AD6CF', desc: '#74B0A9' },
  },
  sonne: {
    label: 'Sonne',
    light: { bg: '#F8EDC4', title: '#5A4300', desc: '#7A5F10' },
    dark: { bg: '#2A2410', title: '#F0D77A', desc: '#C4AB5A' },
  },
  magenta: {
    label: 'Magenta',
    light: { bg: '#F6DCE8', title: '#6E1642', desc: '#8E3C66' },
    dark: { bg: '#2B1220', title: '#F0A9CB', desc: '#C77FA2' },
  },
  flieder: {
    label: 'Flieder',
    light: { bg: '#E6DFF3', title: '#3F2A6B', desc: '#5E4B8A' },
    dark: { bg: '#1E1830', title: '#C6B5EC', desc: '#A090CC' },
  },
};

export const GROUP_COLOR_KEYS: readonly GroupColor[] = GROUP_COLORS;

/** Unknown or missing keys (a palette that shrank, an old client) fall back to no colour. */
export function resolveGroupColor(color: string | null | undefined): GroupColor | null {
  return color != null && color in GROUP_COLOR_STYLES ? (color as GroupColor) : null;
}
