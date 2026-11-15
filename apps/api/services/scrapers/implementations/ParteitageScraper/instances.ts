/**
 * Antragsgrün-Seiten, deren Parteitage im Notebook „Parteitage" stehen.
 *
 * Aufgenommen wird nur eine Seite mit eingeschalteter öffentlicher REST-API
 * (Seiteneinstellung in Antragsgrün). Stand 15.11.2026: offen ist nur NRW;
 * antraege.gruene.de (BDK) und gruene-bw.antragsgruen.de antworten
 * `{"success":false,"message":"Public API disabled"}`. Eine neue Seite ist ein
 * Eintrag hier — der Scraper fragt keine Adresse an, die hier nicht steht.
 */
export const ANTRAGSGRUEN_INSTANCES = [
  {
    id: 'nrw',
    host: 'gruene-nrw.antragsgruen.de',
    /** Wert der Facette `landesverband`, wie im LV-Notebook. */
    landesverband: 'NRW',
    name: 'GRÜNE NRW',
  },
] as const;

export type AntragsgruenInstance = (typeof ANTRAGSGRUEN_INSTANCES)[number];
export type AntragsgruenInstanceId = AntragsgruenInstance['id'];
