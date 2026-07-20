import { type OfficeKind } from '../components/office/officeItem';

/**
 * Per-type colour identity for the Office tab + read-only viewers, mirroring the
 * Workplace tool tiles. Source of truth for the hues is the web
 * `apps/web/src/config/toolTheme.ts` (TOOL_THEME) — that file expresses them as
 * literal Tailwind classes (JIT constraint), so it can't be imported into RN;
 * these are the same hex values in an RN-shaped {light,dark} map. Keep the two
 * in sync when a hue changes.
 */
export interface OfficeTypeColor {
  tile: string;
  tileDark: string;
  icon: string;
  iconDark: string;
}

export const OFFICE_TYPE_COLORS: Record<OfficeKind, OfficeTypeColor> = {
  doc: { tile: '#F6EFD4', tileDark: '#2B2612', icon: '#6B5A12', iconDark: '#CBB86A' },
  sheet: { tile: '#DDEEEC', tileDark: '#142B28', icon: '#1E4F49', iconDark: '#7CC5BC' },
  presentation: { tile: '#F6E5D4', tileDark: '#2B1D12', icon: '#7A4A1F', iconDark: '#CB9A6A' },
  board: { tile: '#E6F0D6', tileDark: '#202B14', icon: '#3E5A1E', iconDark: '#A6C57C' },
  canvas: { tile: '#E9E7F2', tileDark: '#1F1B2E', icon: '#3E3663', iconDark: '#A99ED1' },
};

export function officeTypeColor(kind: OfficeKind, isDark: boolean): { tile: string; icon: string } {
  const c = OFFICE_TYPE_COLORS[kind];
  return { tile: isDark ? c.tileDark : c.tile, icon: isDark ? c.iconDark : c.icon };
}
