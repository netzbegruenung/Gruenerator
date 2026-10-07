import { colors } from '../../../theme';

/**
 * Bild-Editor warm palette. Light values are the web design verbatim
 * (apps/web/.../bild-editor-v2/BildEditorV2Page.tsx); dark is a deep-green
 * adaptation that keeps the same accent greens so the generating gradient reads.
 */
export interface BevPalette {
  base: string;
  /** Vertical approximation of the web radial cream backdrop. */
  radialStops: [string, string, string];
  /** Full-page gradient that fades in while generating. */
  generatingStops: [string, string, string, string, string];
  /** Breathing gradient on the edit-loading placeholder card. */
  editStops: [string, string, string, string, string];
  ink: string;
  muted: string;
  accent: string;
  accentBorder: string;
  primary: string;
  cardBg: string;
  chipInk: string;
  overlayPill: string;
  overlayPillBorder: string;
}

const LIGHT: BevPalette = {
  base: '#fdfbf5',
  radialStops: ['#f7ecce', '#faf4e2', '#fdfbf5'],
  generatingStops: ['#f7ecce', '#dcebe1', '#b7d8c8', '#f4d58d', '#f7ecce'],
  editStops: ['#f7ecce', '#b7d8c8', '#52907A', '#f4d58d', '#f7ecce'],
  ink: '#23372e',
  muted: '#6b7a70',
  accent: '#3d6e5c',
  accentBorder: 'rgba(61,110,92,0.28)',
  primary: colors.primary[600],
  cardBg: '#ffffff',
  chipInk: '#3d6e5c',
  overlayPill: 'rgba(255,255,255,0.78)',
  overlayPillBorder: 'rgba(35,55,46,0.08)',
};

const DARK: BevPalette = {
  base: '#0f1c16',
  radialStops: ['#16281f', '#12211a', '#0f1c16'],
  generatingStops: ['#22362b', '#294a3b', '#3a7461', '#4d4a24', '#22362b'],
  editStops: ['#22362b', '#3a7461', '#56af31', '#4d4a24', '#22362b'],
  ink: '#eef2e8',
  muted: '#9db3a6',
  accent: colors.primary[300],
  accentBorder: 'rgba(138,201,176,0.32)',
  primary: colors.primary[500],
  cardBg: '#16281f',
  chipInk: colors.primary[200],
  overlayPill: 'rgba(22,40,31,0.82)',
  overlayPillBorder: 'rgba(255,255,255,0.10)',
};

export function getBevPalette(isDark: boolean): BevPalette {
  return isDark ? DARK : LIGHT;
}

/**
 * The start screen's tone: the same palette with the Studio violet as accent,
 * matching its backdrop and composer. `sheet` is the bottom sheets' ground.
 */
export function getStudioPalette(isDark: boolean): BevPalette & { sheet: string } {
  return isDark
    ? {
        ...DARK,
        primary: '#A99ED1',
        accent: '#A99ED1',
        chipInk: '#C6BCE4',
        accentBorder: 'rgba(169,158,209,0.32)',
        muted: '#A49CBD',
        sheet: '#1A1626',
      }
    : {
        ...LIGHT,
        primary: '#3E3663',
        accent: '#3E3663',
        chipInk: '#3E3663',
        accentBorder: 'rgba(62,54,99,0.22)',
        ink: '#2A2440',
        muted: '#6B6585',
        sheet: '#F8F7FC',
      };
}
