/**
 * Predefined events for the event step. Selecting one fills Anlass, Ziel and
 * the Funktion the trip was made in, and — when the event's times are known —
 * Reisebeginn/Rückkehr as a starting point (the form counts from the front
 * door, so the user adjusts them).
 *
 * Dates and venues are taken from the official pages linked in `quelle`, as
 * they stood on 08.10.2026; nothing here is filled in beyond what those pages
 * say. A static config; later this can move to a per-Landesverband DB table.
 */
export interface Veranstaltung {
  id: string;
  anlass: string;
  /** Venue with address, or '' while the organiser has not announced it. */
  ziel: string;
  /** Prefill for the form's "Funktion" field. */
  funktion: string;
  /**
   * Event start/end: `YYYY-MM-DDTHH:mm` when the time is known, `YYYY-MM-DD`
   * when only the day is. Only full times prefill the travel times.
   */
  beginn?: string;
  ende?: string;
  /** Shown on the card, e.g. that a date is provisional. */
  hinweis?: string;
  /** Where the dates and venue come from. */
  quelle?: string;
}

export const VERANSTALTUNGEN: Veranstaltung[] = [
  {
    id: 'laenderrat',
    anlass: 'Länderrat',
    ziel: 'Westhafenstraße 1, 13353 Berlin',
    funktion: 'Delegierte*r zum Länderrat',
  },
  {
    id: 'bdk-52',
    anlass: '52. Bundesdelegiertenkonferenz',
    ziel: 'CityCube Berlin, Messedamm 26, 14055 Berlin',
    funktion: 'Delegierte*r zur 52. BDK',
    // Plenum starts Fri 15:00; the BDK ends Sun "gegen voraussichtlich 14:00 Uhr".
    beginn: '2026-12-04T15:00',
    ende: '2026-12-06T14:00',
    quelle: 'https://www.gruene.de/artikel/52-bdk-berlin',
  },
  {
    id: 'lpt-by-2026',
    anlass: 'Landesparteitag Bayern',
    ziel: 'Sparkassen Arena, Niedermayerstraße 100, 84036 Landshut',
    funktion: 'Delegierte*r zum Landesparteitag Bayern',
    beginn: '2026-10-10T11:00',
    ende: '2026-10-11T14:00',
    quelle: 'https://www.gruene-bayern.de/termin/landesparteitag-landshut/',
  },
  {
    id: 'ldk-bw-47',
    anlass: '47. Landesdelegiertenkonferenz Baden-Württemberg',
    ziel: 'Oberrheinhalle, Messe Offenburg-Ortenau, Schutterwälder Str. 3, 77656 Offenburg',
    funktion: 'Delegierte*r zur LDK Baden-Württemberg',
    beginn: '2026-10-17T11:00',
    ende: '2026-10-18',
    quelle: 'https://www.gruene-bw.de/partei/parteitage/',
  },
  {
    id: 'lpt-sh-2026',
    anlass: 'Landesparteitag Schleswig-Holstein',
    ziel: '',
    funktion: 'Delegierte*r zum Landesparteitag Schleswig-Holstein',
    beginn: '2026-10-31',
    ende: '2026-11-01',
    hinweis: 'Ort noch nicht bekannt',
    quelle: 'https://sh-gruene.de/blog/termine/',
  },
  {
    id: 'ldk-ni-2026',
    anlass: 'Landesdelegiertenkonferenz Niedersachsen',
    ziel: 'Rattenfängerhalle Hameln, Mühlenstr. 17, 31785 Hameln',
    funktion: 'Delegierte*r zur LDK Niedersachsen',
    beginn: '2026-11-07T14:00',
    ende: '2026-11-08T14:00',
    quelle: 'https://gruene-niedersachsen.de/termin/landesparteitag-hameln/',
  },
  {
    id: 'ldv-rp-2026',
    anlass: 'Landesdelegiertenversammlung Rheinland-Pfalz',
    ziel: 'Rheintal-Kongress-Zentrum, Hindenburganlage 1a, 55411 Bingen am Rhein',
    funktion: 'Delegierte*r zur LDV Rheinland-Pfalz',
    beginn: '2026-11-07T10:00',
    ende: '2026-11-07T19:00',
    quelle: 'https://gruene-rlp.de/termine/ldv-ii/',
  },
  {
    id: 'lpt-sl-2026',
    anlass: 'Landesparteitag Saarland',
    ziel: 'Nikolaus-Jung Stadthalle, Pfarrgasse 10, 66822 Lebach',
    funktion: 'Delegierte*r zum Landesparteitag Saarland',
    beginn: '2026-11-07T10:00',
    ende: '2026-11-07',
    quelle: 'https://gruene-saar.de/landesparteitag-07-november-2026/',
  },
  {
    // Kept as 'ldk-nrw' — the id the list carried before it had dates.
    id: 'ldk-nrw',
    anlass: 'Landesdelegiertenkonferenz NRW',
    ziel: 'Congress Center Essen West, Eingang Norbertstraße, 45131 Essen',
    funktion: 'Delegierte*r zur LDK NRW',
    beginn: '2026-11-13T14:00',
    ende: '2026-11-15T18:00',
    quelle: 'https://gruene-nrw.de/ldk/',
  },
  {
    id: 'ldk-th-2026',
    anlass: 'Landesdelegiertenkonferenz Thüringen',
    ziel: 'CCS Suhl – Saal Simson, Friedrich-König-Straße 7, 98527 Suhl',
    funktion: 'Delegierte*r zur LDK Thüringen',
    beginn: '2026-11-13',
    ende: '2026-11-14',
    quelle: 'https://gruene-thueringen.de/termine/landesdelegiertenkonferenz-5/',
  },
  {
    id: 'ldk-bb-56',
    anlass: '56. Landesdelegiertenkonferenz Brandenburg',
    ziel: 'Holiday Inn Conference Centre, Hans-Grade-Allee 5, 12529 Schönefeld',
    funktion: 'Delegierte*r zur LDK Brandenburg',
    beginn: '2026-11-14T09:30',
    ende: '2026-11-14',
    quelle: 'https://gruene-brandenburg.de/termine/landesdelegiertenkonferenz-in-schoenefeld/',
  },
  {
    id: 'lmv-hb-2026',
    anlass: 'Landesmitgliederversammlung Bremen (Wahlprogramm)',
    ziel: 'Bürgerzentrum Vahr, Berliner Freiheit, 28327 Bremen',
    funktion: 'Mitglied, Teilnahme an der LMV Bremen',
    beginn: '2026-11-15T10:30',
    ende: '2026-11-15T18:00',
    quelle: 'https://gruene-bremen.de/termine/landesmitgliederversammlung-zum-wahlprogramm/',
  },
  {
    id: 'lmv-hh-2026',
    anlass: 'Landesmitgliederversammlung Hamburg',
    ziel: '',
    funktion: 'Mitglied, Teilnahme an der LMV Hamburg',
    beginn: '2026-11-21',
    ende: '2026-11-21',
    hinweis: 'Termin voraussichtlich, Ort noch nicht bekannt',
    quelle: 'https://www.gruene-hamburg.de/landesmitgliederversammlung/',
  },
];

const hatUhrzeit = (iso: string | undefined): iso is string => !!iso && iso.includes('T');

/** Travel times to prefill: only an event time that is actually known. */
export function reisezeitenVon(v: Pick<Veranstaltung, 'beginn' | 'ende'>): {
  reisebeginn: string;
  rueckkehr: string;
} {
  return {
    reisebeginn: hatUhrzeit(v.beginn) ? v.beginn : '',
    rueckkehr: hatUhrzeit(v.ende) ? v.ende : '',
  };
}

/** "17.10.–18.10.2026" or "07.11.2026" for a one-day event; '' without dates. */
export function zeitraumText(v: Pick<Veranstaltung, 'beginn' | 'ende'>): string {
  if (!v.beginn) return '';
  const tag = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');
  const von = tag(v.beginn);
  const bis = v.ende ? tag(v.ende) : von;
  return von === bis ? von : `${von.slice(0, 6)}–${bis}`;
}

/** Events that have not ended before `heute` (date-only comparison), in date order. */
export function anstehendeVeranstaltungen(heute: Date): Veranstaltung[] {
  const y = heute.getFullYear();
  const m = `${heute.getMonth() + 1}`.padStart(2, '0');
  const d = `${heute.getDate()}`.padStart(2, '0');
  const stichtag = `${y}-${m}-${d}`;
  return VERANSTALTUNGEN.filter((v) => !v.ende || v.ende.slice(0, 10) >= stichtag).sort((a, b) =>
    (a.beginn ?? '9999').localeCompare(b.beginn ?? '9999')
  );
}
