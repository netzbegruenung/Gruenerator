/**
 * Predefined events for the event step. Selecting one fills Anlass, Ziel and
 * the Funktion the trip was made in,
 * and — when the event has dates — Reisebeginn/Rückkehr as a starting point
 * (the form counts from the front door, so the user adjusts them).
 * A static config; later this can move to a per-Landesverband DB table.
 */
export interface Veranstaltung {
  id: string;
  label: string;
  anlass: string;
  ziel: string;
  /** Prefill for the form's "Funktion" field. */
  funktion: string;
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
    funktion: 'Delegierte*r zum Länderrat',
  },
  {
    id: 'bdk-52',
    label: '52. Bundesdelegiertenkonferenz (BDK) Berlin',
    anlass: '52. Bundesdelegiertenkonferenz',
    ziel: 'CityCube Berlin, Messedamm 26, 14055 Berlin',
    funktion: 'Delegierte*r zur 52. BDK',
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
    funktion: 'Delegierte*r zur LDK NRW',
  },
];
