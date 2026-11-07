import { useColorScheme } from 'react-native';

/**
 * Farben der Dashboard-Flächen (Wissen, Briefing, Umfragen). Die Werte stammen aus
 * `apps/web/src/components/dashboard/dashboardTokens.css`; wo das Web Transparenz
 * nutzt, steht hier der fertige Wert. Komponenten lesen sie nur über
 * {@link useDashboardColors}, nie als Literal.
 */
export interface DashboardColors {
  mg: string;
  mgInk: string;
  onMg: string;
  mgTint: string;
  mgTint2: string;
  mgSub: string;
  mgDot: string;
  page: string;
  card: string;
  skeleton: string;
}

export const dashboardColors = {
  light: {
    mg: '#b0005f',
    mgInk: '#8a004a',
    onMg: '#ffffff',
    mgTint: '#fce4ef',
    mgTint2: '#f8cfe1',
    mgSub: '#6e2a4c',
    mgDot: '#e7c3d4',
    page: '#f9f6f7',
    card: '#ffffff',
    skeleton: '#efe8eb',
  },
  dark: {
    mg: '#f06ba8',
    mgInk: '#f7b3d2',
    onMg: '#161314',
    mgTint: '#3a1a2b',
    mgTint2: '#4a2238',
    mgSub: '#d9a3bd',
    mgDot: '#5a3447',
    page: '#161314',
    card: '#242022',
    skeleton: '#332c30',
  },
} as const satisfies Record<'light' | 'dark', DashboardColors>;

export function useDashboardColors(): DashboardColors {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? dashboardColors.dark : dashboardColors.light;
}
