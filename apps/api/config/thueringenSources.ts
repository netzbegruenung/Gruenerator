/**
 * Thüringen PDF Sources
 *
 * Hardcoded PDF URLs for Beschlüsse (LDK resolutions) and Wahlprogramme
 * that cannot be discovered via web scraping pagination.
 */

export interface ThueringenPdfSource {
  url: string;
  title: string;
  date: string; // ISO YYYY-MM-DD
  contentType: 'beschluss' | 'wahlprogramm';
  category?: string;
}

// ═══════════════════════════════════════════════════════════════════
// WAHLPROGRAMME (5 PDFs, no time limit)
// ═══════════════════════════════════════════════════════════════════

export const THUERINGEN_WAHLPROGRAMME: ThueringenPdfSource[] = [
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2024/05/Buendnis_90_Die_Gruenen-Thueringen_LTW2024_Wahlprogramm.pdf',
    title: 'Wahlprogramm Landtagswahl 2024',
    date: '2024-05-01',
    contentType: 'wahlprogramm',
    category: 'Wahlprogramm LTW 2024',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2021/07/B90G_TH-2021.06-Alles_drin_fuer_Thueringen-Gruenes_Wahlprogramm.pdf',
    title: 'Alles drin für Thüringen – Grünes Wahlprogramm 2021',
    date: '2021-06-01',
    contentType: 'wahlprogramm',
    category: 'Wahlprogramm LTW 2021',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/05/B90G_TH-Wahlprogramm_zur_Landtagswahl_2019-Webversion.pdf',
    title: 'Wahlprogramm zur Landtagswahl 2019',
    date: '2019-01-01',
    contentType: 'wahlprogramm',
    category: 'Wahlprogramm LTW 2019',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Landtagswahlprogramm-2014.pdf',
    title: 'Landtagswahlprogramm 2014',
    date: '2014-01-01',
    contentType: 'wahlprogramm',
    category: 'Wahlprogramm LTW 2014',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2023/06/Druckfassung-Landtagswahlprogramm_2009.pdf',
    title: 'Landtagswahlprogramm 2009',
    date: '2009-01-01',
    contentType: 'wahlprogramm',
    category: 'Wahlprogramm LTW 2009',
  },
];

// ═══════════════════════════════════════════════════════════════════
// BESCHLÜSSE (~93 PDFs, 2014–2025)
// ═══════════════════════════════════════════════════════════════════

export const THUERINGEN_BESCHLUESSE: ThueringenPdfSource[] = [
  // --- LDK Oktober 2025 ---
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/10/L1_Fuer_eine_starke_Gesellschaft_mit_Zukunft_Kein_Rotstift_bei_Naturschutz_Klima_und_gesellschaftliche-2.pdf',
    title: 'Für eine starke Gesellschaft mit Zukunft – Kein Rotstift bei Naturschutz, Klima und gesellschaftliche Teilhabe',
    date: '2025-10-01',
    contentType: 'beschluss',
    category: 'LDK Oktober 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/10/A2_Menschenrechtsbasierte_Migrationspolitik_anstelle_von_Diskriminierung_gegen_jeden_Leistungs-_und_Te.pdf',
    title: 'Menschenrechtsbasierte Migrationspolitik anstelle von Diskriminierung',
    date: '2025-10-01',
    contentType: 'beschluss',
    category: 'LDK Oktober 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/10/A3_Demokratie_am_Arbeitsplatz_staerken_-_Betriebsratswahlen_2026_aktiv_unterstuetzen.pdf',
    title: 'Demokratie am Arbeitsplatz stärken – Betriebsratswahlen 2026 aktiv unterstützen',
    date: '2025-10-01',
    contentType: 'beschluss',
    category: 'LDK Oktober 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/10/A5_Gemeinsam_Strategien_fuer_buendnisgruene_Politik_entwickeln.pdf',
    title: 'Gemeinsam Strategien für bündnisgrüne Politik entwickeln',
    date: '2025-10-01',
    contentType: 'beschluss',
    category: 'LDK Oktober 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/10/A6_Einfuehrung_eines_LAG-Sprecherinnenrats.pdf',
    title: 'Einführung eines LAG-Sprecherinnenrats',
    date: '2025-10-01',
    contentType: 'beschluss',
    category: 'LDK Oktober 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/10/A7_Sicherung_der_flaechendeckenden_Geburtshilflichen_Versorgung_als_staatliche_Aufgabe__Intervention_ge.pdf',
    title: 'Sicherung der flächendeckenden geburtshilflichen Versorgung als staatliche Aufgabe',
    date: '2025-10-01',
    contentType: 'beschluss',
    category: 'LDK Oktober 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/10/A8_Besserer_Schutz_fuer_politisches_Engagement_-_die_Landesregierung_muss_jetzt_handeln.pdf',
    title: 'Besserer Schutz für politisches Engagement – die Landesregierung muss jetzt handeln',
    date: '2025-10-01',
    contentType: 'beschluss',
    category: 'LDK Oktober 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/10/A9_Thueringen_bewahren_und_gestalten__Fuer_eine_oekologische_und_vielfaeltige_Heimat.pdf',
    title: 'Thüringen bewahren und gestalten – Für eine ökologische und vielfältige Heimat',
    date: '2025-10-01',
    contentType: 'beschluss',
    category: 'LDK Oktober 2025',
  },

  // --- LDK Januar 2025 ---
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/01/A1_Nichtraucherinnen__Schutz.pdf',
    title: 'Nichtraucherinnen-Schutz',
    date: '2025-01-01',
    contentType: 'beschluss',
    category: 'LDK Januar 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/01/A2_Den_eXit_wagen__X_verlassen.pdf',
    title: 'Den eXit wagen – X verlassen',
    date: '2025-01-01',
    contentType: 'beschluss',
    category: 'LDK Januar 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/01/A3_An_der_Seite_der_Betroffenen_Fuer_ein_Thueringer_Landesantidiskriminierungsgesetz_.pdf',
    title: 'An der Seite der Betroffenen – Für ein Thüringer Landesantidiskriminierungsgesetz',
    date: '2025-01-01',
    contentType: 'beschluss',
    category: 'LDK Januar 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/01/A4_Gemeinsam_stabil_bleiben_Strategien_fuer_eine_starke_ausserparlamentarische_Opposition.pdf',
    title: 'Gemeinsam stabil bleiben – Strategien für eine starke außerparlamentarische Opposition',
    date: '2025-01-01',
    contentType: 'beschluss',
    category: 'LDK Januar 2025',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/2/2025/01/A5_Prozess_fuer_die_Landtagswahlauswertung.pdf',
    title: 'Prozess für die Landtagswahlauswertung',
    date: '2025-01-01',
    contentType: 'beschluss',
    category: 'LDK Januar 2025',
  },

  // --- LDK Februar 2024 ---
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2024/02/D1_DRINGLICHKEITSANTRAG_Was_jetzt_zu_tun_ist_10_Punkte_fuer_eine_stabile_Demokratie_in_Thueringen.pdf',
    title: 'Dringlichkeitsantrag: Was jetzt zu tun ist – 10 Punkte für eine stabile Demokratie in Thüringen',
    date: '2024-02-01',
    contentType: 'beschluss',
    category: 'LDK Februar 2024',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2024/02/L1_Starke_Kommunen_fuer_Zukunft_Demokratie_und_Gemeinschaft.pdf',
    title: 'Starke Kommunen für Zukunft, Demokratie und Gemeinschaft',
    date: '2024-02-01',
    contentType: 'beschluss',
    category: 'LDK Februar 2024',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2024/02/A1_THUERINGER_WEG__Faechergruppe_Ethik__Philosophie__Religion_an_Thueringer_Schulen.pdf',
    title: 'Thüringer Weg – Fächergruppe Ethik, Philosophie, Religion an Thüringer Schulen',
    date: '2024-02-01',
    contentType: 'beschluss',
    category: 'LDK Februar 2024',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2024/02/A2_Wo_bleibt_das_Klimageld__Fuer_sozial_gerechten_Klimaschutz.pdf',
    title: 'Wo bleibt das Klimageld? Für sozial gerechten Klimaschutz',
    date: '2024-02-01',
    contentType: 'beschluss',
    category: 'LDK Februar 2024',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2024/02/A3_Menschenwuerdiges_Buergerinnengeld.pdf',
    title: 'Menschenwürdiges Bürgerinnengeld',
    date: '2024-02-01',
    contentType: 'beschluss',
    category: 'LDK Februar 2024',
  },

  // --- LDK März 2023 ---
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2023/03/L1NEU18_In_stuermischen_Zeiten_fuer_Thueringens_Zukunft-2-1.pdf',
    title: 'In stürmischen Zeiten für Thüringens Zukunft',
    date: '2023-03-01',
    contentType: 'beschluss',
    category: 'LDK März 2023',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2023/03/A1NEU_Versorgungsstrukturen_an_den_medizinischen_Bedarf_der_Menschen_anpassen_-__Fuer_ein_gut_zugaengliches.pdf',
    title: 'Versorgungsstrukturen an den medizinischen Bedarf der Menschen anpassen – Für ein gut zugängliches Gesundheitssystem',
    date: '2023-03-01',
    contentType: 'beschluss',
    category: 'LDK März 2023',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2023/03/A3_Starke_Gruene_starkes_Thueringen_Gruene_Weichenstellungen_fuer_ein_erfolgreiches_Superwahljahr_2024.pdf',
    title: 'Starke Grüne, starkes Thüringen – Grüne Weichenstellungen für ein erfolgreiches Superwahljahr 2024',
    date: '2023-03-01',
    contentType: 'beschluss',
    category: 'LDK März 2023',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2023/03/A4_Solidaritaet_mit_Wohnprojekten_-_Wohnpolitik_sozial_gerecht_und_oekologisch_ausrichten.pdf',
    title: 'Solidarität mit Wohnprojekten – Wohnpolitik sozial gerecht und ökologisch ausrichten',
    date: '2023-03-01',
    contentType: 'beschluss',
    category: 'LDK März 2023',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2023/03/A6_Konsequente_Umsetzung_der_Istanbul-Konvention_in_Thueringen.pdf',
    title: 'Konsequente Umsetzung der Istanbul-Konvention in Thüringen',
    date: '2023-03-01',
    contentType: 'beschluss',
    category: 'LDK März 2023',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2023/03/A7NEU3_Rechtsruck_der_CDU_Thueringen_offen_benennen__Konsequenzen_ziehen-2.pdf',
    title: 'Rechtsruck der CDU Thüringen offen benennen – Konsequenzen ziehen',
    date: '2023-03-01',
    contentType: 'beschluss',
    category: 'LDK März 2023',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2023/03/A8_Solidaritaet_mit_den_Menschen_in_der_Ukraine_-_Selbstverteidigungsrecht_ist_Voelkerrecht.pdf',
    title: 'Solidarität mit den Menschen in der Ukraine – Selbstverteidigungsrecht ist Völkerrecht',
    date: '2023-03-01',
    contentType: 'beschluss',
    category: 'LDK März 2023',
  },

  // --- Landesvorstand September 2022 ---
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/09/Winter-der-Solidaritaet-Forderungspapier-des-Thueringer-Landesvorstands-vom-11092022.pdf',
    title: 'Winter der Solidarität – Forderungspapier des Thüringer Landesvorstands',
    date: '2022-09-11',
    contentType: 'beschluss',
    category: 'Landesvorstand September 2022',
  },

  // --- LDK Juni 2022 ---
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/L1NEU13_Leitantrag_Zeitenwende_Was_Thueringen_jetzt_tun_muss.pdf',
    title: 'Leitantrag Zeitenwende – Was Thüringen jetzt tun muss',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/D1_Nicht_gegen_die_Krise_ansparen.pdf',
    title: 'Nicht gegen die Krise ansparen',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/D2_Keulaer_Wald_Retten_Abbaggerung_stoppen.pdf',
    title: 'Keulaer Wald retten – Abbaggerung stoppen',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/A1_Unterstuetzung_der_wissenschaftsbasierten_Standortsuche_in_Thueringen.pdf',
    title: 'Unterstützung der wissenschaftsbasierten Standortsuche in Thüringen',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/A3NEU3_Aufbau_einer_gruenen_und_blauen_Infrastruktur_fuer_Thueringen.pdf',
    title: 'Aufbau einer grünen und blauen Infrastruktur für Thüringen',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/A4_Freiwilligendienste_ausbauen_anerkennen_und_modernisieren-1.pdf',
    title: 'Freiwilligendienste ausbauen, anerkennen und modernisieren',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/A5NEU_Es_klappert_die_Muehle_auch_weiterhin_am_Bach_Ausnahmen_fuer_Muehlen_zur_Energiegewinnung_schaffen.pdf',
    title: 'Es klappert die Mühle auch weiterhin am Bach – Ausnahmen für Mühlen zur Energiegewinnung schaffen',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/A6NEU_Geburtshilfe_im_laendlichen_Raum_in_Thueringen_sicherstellen.pdf',
    title: 'Geburtshilfe im ländlichen Raum in Thüringen sicherstellen',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/A7NEU4_Guter_Nahverkehr_jetzt_9_Ticket_verstetigen_und_Schiene_endlich_ausbauen-1.pdf',
    title: 'Guter Nahverkehr jetzt – 9-Euro-Ticket verstetigen und Schiene endlich ausbauen',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/A8NEU_Forderung_der_Thueringer_Gruenen_fuer_ein_Tempo_130_auf_Autobahnen.pdf',
    title: 'Forderung der Thüringer Grünen für ein Tempo 130 auf Autobahnen',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2022/06/A9_Strukturprozess_Begleitantrag_Schon_manches_geschafft_noch_viel_zu_tun.pdf',
    title: 'Strukturprozess Begleitantrag – Schon manches geschafft, noch viel zu tun',
    date: '2022-06-01',
    contentType: 'beschluss',
    category: 'LDK Juni 2022',
  },

  // --- LDK 2021 ---
  {
    url: 'https://gruene-thueringen.de/wp-content/uploads/sites/88/2021/09/B90G_TH-2021.06-Eigenstaendig_Konzeptstark_Gruen.pdf',
    title: 'Eigenständig, Konzeptstark, Grün',
    date: '2021-06-01',
    contentType: 'beschluss',
    category: 'LDK 2021',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Perspektiven_fuer_junge_Menschen_in_der_Pandemie_schaffen-2021.pdf',
    title: 'Perspektiven für junge Menschen in der Pandemie schaffen',
    date: '2021-01-01',
    contentType: 'beschluss',
    category: 'LDK 2021',
  },

  // --- Beschlüsse 2020 ---
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Gemeinsam_fokussiert_entschlossen_fuer_Thueringen-Buendnisgrueuen-2020.pdf',
    title: 'Gemeinsam, fokussiert, entschlossen für Thüringen – Bündnisgrüne',
    date: '2020-01-01',
    contentType: 'beschluss',
    category: 'LDK 2020',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Klug_investieren_in_Bildung_und_Klima_fuer_ein_krisenfestes_und_zukunftssicheres_Thueringen-2020.pdf',
    title: 'Klug investieren in Bildung und Klima für ein krisenfestes und zukunftssicheres Thüringen',
    date: '2020-01-01',
    contentType: 'beschluss',
    category: 'LDK 2020',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Thueringen_will_sicherer_Hafen_sein-2020.pdf',
    title: 'Thüringen will sicherer Hafen sein',
    date: '2020-01-01',
    contentType: 'beschluss',
    category: 'LDK 2020',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Lebendige_Innenstaedte-Stadtkerne_fuer_die_Zukunft-2020.pdf',
    title: 'Lebendige Innenstädte – Stadtkerne für die Zukunft',
    date: '2020-01-01',
    contentType: 'beschluss',
    category: 'LDK 2020',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-In_Verantwortung_fuer_Thueringen-Gemeinsam_neue_Wege_gehen-2020.pdf',
    title: 'In Verantwortung für Thüringen – Gemeinsam neue Wege gehen',
    date: '2020-01-01',
    contentType: 'beschluss',
    category: 'LDK 2020',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Aufbruch_fuer_neue_Perspektiven-2020.pdf',
    title: 'Aufbruch für neue Perspektiven',
    date: '2020-01-01',
    contentType: 'beschluss',
    category: 'LDK 2020',
  },

  // --- Beschlüsse 2019 ---
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Auftrag_zur_Satzungsaenderung-2019.pdf',
    title: 'Auftrag zur Satzungsänderung',
    date: '2019-01-01',
    contentType: 'beschluss',
    category: 'LDK 2019',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Strategie_fuer_den_laendlichen_Raum-2019.pdf',
    title: 'Strategie für den ländlichen Raum',
    date: '2019-01-01',
    contentType: 'beschluss',
    category: 'LDK 2019',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Positionierung_des_Landesvorstands_zum_Gute_Kita-Gesetz-2019.pdf',
    title: 'Positionierung des Landesvorstands zum Gute-Kita-Gesetz',
    date: '2019-01-01',
    contentType: 'beschluss',
    category: 'LDK 2019',
  },

  // --- Beschlüsse 2018 ---
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Landesfoerderung_beim_Kauf_von_Lastenfahrraedern-2018.pdf',
    title: 'Landesförderung beim Kauf von Lastenfahrrädern',
    date: '2018-01-01',
    contentType: 'beschluss',
    category: 'LDK 2018',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Regionalen_Wohlfahrtsindex_fuer_Thueringen_fortfuehren-2018.pdf',
    title: 'Regionalen Wohlfahrtsindex für Thüringen fortführen',
    date: '2018-01-01',
    contentType: 'beschluss',
    category: 'LDK 2018',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Besser_unterwegs_in_Thueringen-Mobilitaetswende_mit_Konzept-2018.pdf',
    title: 'Besser unterwegs in Thüringen – Mobilitätswende mit Konzept',
    date: '2018-01-01',
    contentType: 'beschluss',
    category: 'LDK 2018',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G-Mehr_GRUEN-Fuer_starke_GRUNE_im_Wahljahr_2019-2018.pdf',
    title: 'Mehr GRÜN – Für starke GRÜNE im Wahljahr 2019',
    date: '2018-01-01',
    contentType: 'beschluss',
    category: 'LDK 2018',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Feminismus_zur_ChefInnensache_machen-2018.pdf',
    title: 'Feminismus zur ChefInnensache machen',
    date: '2018-01-01',
    contentType: 'beschluss',
    category: 'LDK 2018',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Aktivitaeten_von_Nazis_Grenzen_setzen-2018.pdf',
    title: 'Aktivitäten von Nazis Grenzen setzen',
    date: '2018-01-01',
    contentType: 'beschluss',
    category: 'LDK 2018',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Genderbudgeting_auch_in_Thueringen_umsetzen-2018.pdf',
    title: 'Genderbudgeting auch in Thüringen umsetzen',
    date: '2018-01-01',
    contentType: 'beschluss',
    category: 'LDK 2018',
  },

  // --- Beschlüsse 2017 ---
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Mit_kommunalem_Investitionspaket_oekologisch_und_sozial_gestalten-2017.pdf',
    title: 'Mit kommunalem Investitionspaket ökologisch und sozial gestalten',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Zukunftsfaehig_demokratisch_gut-Gruene_Perspektiven_fuer_eine_moderne_Schulpolitik_in_Thueringen-2017.pdf',
    title: 'Zukunftsfähig, demokratisch, gut – Grüne Perspektiven für eine moderne Schulpolitik in Thüringen',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Forward_to_the_future-Gruene_Leitlinien_fuer_eine_digitale_Zukunft-2017.pdf',
    title: 'Forward to the future – Grüne Leitlinien für eine digitale Zukunft',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Privatsphaere_schuetzen-Gegen_unverhaeltnismaessige_Polizeibefugnisse-2017.pdf',
    title: 'Privatsphäre schützen – Gegen unverhältnismäßige Polizeibefugnisse',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Thueringen_zusammen_zukunftssicher_machen-2017.pdf',
    title: 'Thüringen zusammen zukunftssicher machen',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Die_Gebietsreform_braucht_Transparenz_klare_Kriterien_und_eine_ernstgemeinte_BuergerInnenbeteiligung-2017.pdf',
    title: 'Die Gebietsreform braucht Transparenz, klare Kriterien und eine ernstgemeinte BürgerInnenbeteiligung',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Gruen_wirkt_in_Thueringen-Wir_haben_noch_viel_vor-2017.pdf',
    title: 'Grün wirkt in Thüringen – Wir haben noch viel vor',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Viel_erreicht_und_noch_viel_vor-2017.pdf',
    title: 'Viel erreicht und noch viel vor',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Nein_zu_CETA-2017.pdf',
    title: 'Nein zu CETA',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Vegane_Lebensmittel_auf_gruenen_Veranstaltungen-2017.pdf',
    title: 'Vegane Lebensmittel auf grünen Veranstaltungen',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Energiewende_fair_verlaesslich_gerecht_und_naturvertraeglich_gestalten-2017.pdf',
    title: 'Energiewende fair, verlässlich, gerecht und naturverträglich gestalten',
    date: '2017-01-01',
    contentType: 'beschluss',
    category: 'LDK 2017',
  },

  // --- Beschlüsse 2016 ---
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Jetzt_handeln-Thueringen_zum_Klimaschutzland_machen-2016.pdf',
    title: 'Jetzt handeln – Thüringen zum Klimaschutzland machen',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Die_Funktional-_Verwaltungs_und_Gebietsreform_nutzen-2016.pdf',
    title: 'Die Funktional-, Verwaltungs- und Gebietsreform nutzen',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Keine_Kuerzungen_im_Suedthueringer_Bahnnetz-2016.pdf',
    title: 'Keine Kürzungen im Südthüringer Bahnnetz',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Kitas_staerken-Kinder_foerdern-Eltern_unterstuetzen-2016.pdf',
    title: 'Kitas stärken – Kinder fördern – Eltern unterstützen',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Eisenbahnstrecke_Gotha-Leinefelde_elektrifizieren_und_optimal_nutzbar_machen-2016.pdf',
    title: 'Eisenbahnstrecke Gotha–Leinefelde elektrifizieren und optimal nutzbar machen',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Nachhaltige_Flaechenhaushaltspolitik-2016.pdf',
    title: 'Nachhaltige Flächenhaushaltspolitik',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Einfuehrung_von_uebergreifenden_Sozialtickets_in_Thueringen-2016.pdf',
    title: 'Einführung von übergreifenden Sozialtickets in Thüringen',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Umweltfreundlich_und_artgerecht-2016.pdf',
    title: 'Umweltfreundlich und artgerecht',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Gruene_Grundlagen_fuer_ein_Thueringer_Integrations-_und_Teilhabekonzept-2016.pdf',
    title: 'Grüne Grundlagen für ein Thüringer Integrations- und Teilhabekonzept',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Elektronische_Gesundheitskarte_fuer_Asylsuchende_flaechendeckend_in_Thueringen_einfuehren-2016.pdf',
    title: 'Elektronische Gesundheitskarte für Asylsuchende flächendeckend in Thüringen einführen',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Eine_gruene_Positionsbestimmung_zur_derzeitigen_Theater-_und_Orchesterstrukturreform-2016.pdf',
    title: 'Eine grüne Positionsbestimmung zur derzeitigen Theater- und Orchesterstrukturreform',
    date: '2016-01-01',
    contentType: 'beschluss',
    category: 'LDK 2016',
  },

  // --- Beschlüsse 2015 ---
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Rot-Rot-Gruen_bringt_Thueringen_voran-2015.pdf',
    title: 'Rot-Rot-Grün bringt Thüringen voran',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Schienenpersonenfernverkehr_in_Thueringen_attraktiv_und_zukunftssicher_gestalten-2015.pdf',
    title: 'Schienenpersonenfernverkehr in Thüringen attraktiv und zukunftssicher gestalten',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Fuer_besseren_Tierschutz_in_Thueringen-2015.pdf',
    title: 'Für besseren Tierschutz in Thüringen',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Glyphosathaltiges_Pflanzengift_vermeiden-2015.pdf',
    title: 'Glyphosathaltiges Pflanzengift vermeiden',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Offensive_fuer_mehr_Bildungsqualitaet_und_mehr_schulische_Selbststaendigkeit_in_Thueringen-2015.pdf',
    title: 'Offensive für mehr Bildungsqualität und mehr schulische Selbstständigkeit in Thüringen',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Demonstration_fuer_Frieden_und_gegen_deutschen_Waffenhandel_als_eine_der_weltweiten_Fluchtursachen-2015.pdf',
    title: 'Demonstration für Frieden und gegen deutschen Waffenhandel als eine der weltweiten Fluchtursachen',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Fluechtlinge_willkommen-Refugees_welcome-2015.pdf',
    title: 'Flüchtlinge willkommen – Refugees welcome',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Infrastruktur_und_OEPP_gehen_nicht_zusammen-2015.pdf',
    title: 'Infrastruktur und ÖPP gehen nicht zusammen',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Freifunk_in_Thueringen_staerken-2015.pdf',
    title: 'Freifunk in Thüringen stärken',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Kein_Mensch_ist_illegal-2015.pdf',
    title: 'Kein Mensch ist illegal',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Breitbandausbau_zukunftsfaehig_vorantreiben-2015.pdf',
    title: 'Breitbandausbau zukunftsfähig vorantreiben',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Langfristiger_Schutz_der_Suedharzer_Gipskarstlandschaft-2015.pdf',
    title: 'Langfristiger Schutz der Südharzer Gipskarstlandschaft',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Ortsumgehung_Ferna-Teistungen-Duderstadt-Unnoetiges_Strassenbauprojekt-2015.pdf',
    title: 'Ortsumgehung Ferna–Teistungen–Duderstadt – Unnötiges Straßenbauprojekt',
    date: '2015-01-01',
    contentType: 'beschluss',
    category: 'LDK 2015',
  },

  // --- Beschlüsse 2014 ---
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Landesministerien_klimatechnisch_ueberpruefen-2014.pdf',
    title: 'Landesministerien klimatechnisch überprüfen',
    date: '2014-01-01',
    contentType: 'beschluss',
    category: 'LDK 2014',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Trennung_von_Regierungsamt_und_Abgeordnetenmandat_bzw._Parteivorsitz-2014.pdf',
    title: 'Trennung von Regierungsamt und Abgeordnetenmandat bzw. Parteivorsitz',
    date: '2014-01-01',
    contentType: 'beschluss',
    category: 'LDK 2014',
  },
  {
    url: 'https://www.gruene-thueringen.de/wp-content/uploads/sites/88/2021/03/B90G_TH-Thueringen_wird_GRUEN-2014.pdf',
    title: 'Thüringen wird GRÜN',
    date: '2014-01-01',
    contentType: 'beschluss',
    category: 'LDK 2014',
  },
];

// ═══════════════════════════════════════════════════════════════════
// COMBINED
// ═══════════════════════════════════════════════════════════════════

export const ALL_THUERINGEN_PDFS: ThueringenPdfSource[] = [
  ...THUERINGEN_WAHLPROGRAMME,
  ...THUERINGEN_BESCHLUESSE,
];
