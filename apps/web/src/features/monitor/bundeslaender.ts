/**
 * The 16 German Bundesländer, joined across the Monitor's data sources.
 *
 * - `id`   — PolitPro parliament id, used by the poll endpoint (`usePolls(id)`).
 * - `code` — GERDA / Meinungsbild `state_code` ("01"–"16"), used to pivot the
 *            MRP estimates and the Landtagswahl results to a single state.
 * - `name` — full official name (used in the Bundesland selector).
 * - `display` — optional compact label for tight UIs (defaults to `name`).
 */
export interface Bundesland {
  id: string;
  code: string;
  name: string;
  short: string;
  display?: string;
}

export const BUNDESLAENDER: Bundesland[] = [
  { id: 'schleswig-holstein', code: '01', name: 'Schleswig-Holstein', short: 'SH' },
  { id: 'hamburg', code: '02', name: 'Hamburg', short: 'HH' },
  { id: 'niedersachsen', code: '03', name: 'Niedersachsen', short: 'NI' },
  { id: 'bremen', code: '04', name: 'Bremen', short: 'HB' },
  {
    id: 'nordrhein-westfalen',
    code: '05',
    name: 'Nordrhein-Westfalen',
    short: 'NW',
    display: 'NRW',
  },
  { id: 'hessen', code: '06', name: 'Hessen', short: 'HE' },
  { id: 'rheinland-pfalz', code: '07', name: 'Rheinland-Pfalz', short: 'RP' },
  { id: 'baden-wuerttemberg', code: '08', name: 'Baden-Württemberg', short: 'BW' },
  { id: 'bayern', code: '09', name: 'Bayern', short: 'BY' },
  { id: 'saarland', code: '10', name: 'Saarland', short: 'SL' },
  { id: 'berlin', code: '11', name: 'Berlin', short: 'BE' },
  { id: 'brandenburg', code: '12', name: 'Brandenburg', short: 'BB' },
  {
    id: 'mecklenburg-vorpommern',
    code: '13',
    name: 'Mecklenburg-Vorpommern',
    short: 'MV',
    display: 'Meck.-Vorpommern',
  },
  { id: 'sachsen', code: '14', name: 'Sachsen', short: 'SN' },
  { id: 'sachsen-anhalt', code: '15', name: 'Sachsen-Anhalt', short: 'ST' },
  { id: 'thueringen', code: '16', name: 'Thüringen', short: 'TH' },
];

export const bundeslandById = (id: string): Bundesland | undefined =>
  BUNDESLAENDER.find((b) => b.id === id);

export const bundeslandByCode = (code: string): Bundesland | undefined =>
  BUNDESLAENDER.find((b) => b.code === code);
