/**
 * Predefined events for wizard prefill. Selecting one fills Anlass + Ziel.
 * v1 is a static config; later this can move to a per-Landesverband DB table.
 */
export interface Veranstaltung {
  id: string;
  label: string;
  anlass: string;
  ziel: string;
}

export const VERANSTALTUNGEN: Veranstaltung[] = [
  {
    id: 'laenderrat',
    label: 'Länderrat',
    anlass: 'Länderrat',
    ziel: 'Westhafenstraße 1, 13353 Berlin',
  },
  {
    id: 'bdk',
    label: 'Bundesdelegiertenkonferenz (BDK)',
    anlass: 'Bundesdelegiertenkonferenz',
    ziel: '',
  },
  {
    id: 'ldk-nrw',
    label: 'Landesdelegiertenkonferenz NRW',
    anlass: 'Landesdelegiertenkonferenz NRW',
    ziel: '',
  },
];
