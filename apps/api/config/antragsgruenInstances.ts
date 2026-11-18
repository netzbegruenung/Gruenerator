/**
 * Antragsgrün-Seiten, deren Parteitage im Grünerator stehen — im Notebook ihres
 * Landesverbands und im Notebook „Parteitage".
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
    /** Wert der Facette `landesverband` — derselbe wie im LV-Notebook (`landesverbaendeConfig.ts`). */
    landesverband: 'NRW',
    name: 'GRÜNE NRW',
    /** `source_id` der Antragsgrün-Dokumente in `landesverbaende_documents`. */
    sourceId: 'nrw-antragsgruen',
    /**
     * `source_id` der Website des Landesverbands. Deren Beschlüsse von LDK und
     * Landesparteirat sind Abschriften der Antragsgrün-Beschlüsse und werden als
     * Dubletten markiert (`websiteDuplicates.ts`).
     */
    websiteSourceIds: ['nordrhein-westfalen-lv'],
    /**
     * Nur diese Konsultationen (`url_path`) werden gelesen; `null` = alle öffentlichen.
     * Start mit der neuesten LDK (Essen, 13.–15.11.2026); der Rest folgt, sobald
     * der Bestand sich im Betrieb bewährt hat (#5685). Ein Eintrag, der hier
     * wegfällt, wird nicht gelöscht: der Scraper besucht die Konsultation dann
     * gar nicht mehr, also auch nicht ihr Aufräumen.
     */
    // Breit typisiert: `null` (alle) ist ein gültiger Wert für die nächste Instanz.
    consultations: ['ldk26-02'] as readonly string[] | null,
  },
] as const;

export type AntragsgruenInstance = (typeof ANTRAGSGRUEN_INSTANCES)[number];

/** Die `source_id`s aller Antragsgrün-Dokumente — die Sicht des Notebooks „Parteitage". */
export const ANTRAGSGRUEN_SOURCE_IDS: string[] = ANTRAGSGRUEN_INSTANCES.map((i) => i.sourceId);
