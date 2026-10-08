/**
 * Predefined events for the event step. Selecting one fills Anlass and Ziel,
 * and — when the event has dates — Reisebeginn/Rückkehr as a starting point
 * (the form counts from the front door, so the user adjusts them).
 * A static config; later this can move to a per-Landesverband DB table.
 */
export interface Veranstaltung {
  id: string;
  label: string;
  anlass: string;
  ziel: string;
  /** Event start/end as `YYYY-MM-DDTHH:mm` (datetime-local), when known. */
  beginn?: string;
  ende?: string;
  /** Where the dates and venue come from. */
  quelle?: string;
}

export const VERANSTALTUNGEN: Veranstaltung[] = [
  {
    id: 'laenderrat',
    label: 'Länderrat',
    anlass: 'Länderrat',
    ziel: 'Westhafenstraße 1, 13353 Berlin',
  },
  {
    id: 'bdk-52',
    label: '52. Bundesdelegiertenkonferenz (BDK) Berlin',
    anlass: '52. Bundesdelegiertenkonferenz',
    ziel: 'CityCube Berlin, Messedamm 26, 14055 Berlin',
    // Plenum starts Fri 15:00; the BDK ends Sun "gegen voraussichtlich 14:00 Uhr".
    beginn: '2026-12-04T15:00',
    ende: '2026-12-06T14:00',
    quelle: 'https://www.gruene.de/artikel/52-bdk-berlin',
  },
  {
    id: 'ldk-nrw',
    label: 'Landesdelegiertenkonferenz NRW',
    anlass: 'Landesdelegiertenkonferenz NRW',
    ziel: '',
  },
];
