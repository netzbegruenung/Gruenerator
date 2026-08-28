/**
 * Per-Landesverband social media account roster.
 *
 * Each entry binds an Instagram or Facebook handle to a Landesverband
 * short code (e.g. 'BE' for Berlin, 'HH' for Hamburg — matching the
 * `landesverband` field used across press collections). The scraper
 * (`SocialMediaExamplesScraper.ts`) iterates this list alongside the
 * federal accounts and tags each indexed post with the LV code so
 * per-LV PR agents can filter via `examplesLvScope`.
 *
 * **Seeding workflow**: handles are discovered via
 * `scripts/discover-lv-social-handles.ts` (which scrapes each LV's
 * homepage footer for social links), then **verified manually** by
 * opening the IG/FB URL in a browser and confirming the account is
 * the official LV account (branding, recent activity, blue check
 * where applicable). Only verified handles land here.
 *
 * **`verifiedSource` is required** — every row cites the URL where the
 * handle was found (typically the LV homepage). If a handle can't be
 * traced to an LV-controlled source, it does NOT go in here. Stale
 * or unverifiable handles are tracked via TODO comment rows so the
 * gap is visible to future maintainers and other agents.
 *
 * **Fraktion accounts** are deliberately out of scope for Phase 1 —
 * LV-main accounts only. If example quality proves insufficient,
 * Phase 2 adds Fraktion handles with codes like 'BE-F', 'TH-F'.
 *
 * Federal accounts (`die_gruenen`, `B90DieGruenen`, `diegruenen`,
 * `diegruenen.at`) stay in `SocialMediaExamplesScraper.ts` —
 * they have no `lv` and feed all-Germany / all-Austria contexts.
 */

export interface LvSocialAccount {
  /**
   * Landesverband short code matching `landesverband` payload elsewhere.
   * Canonical codes: 'HH', 'SH', 'TH', 'BY', 'BE', 'MV', 'BB'.
   */
  lv: string;
  platform: 'instagram' | 'facebook';
  /** Account handle WITHOUT leading @ (e.g. 'gruene_berlin', not '@gruene_berlin'). */
  handle: string;
  country: 'DE';
  /** URL where this handle was verified (typically the LV homepage with footer link). */
  verifiedSource: string;
}

export const LV_SOCIAL_ACCOUNTS: readonly LvSocialAccount[] = [
  // Seeded 2026-05-11 via `scripts/discover-lv-social-handles.ts`. Each handle
  // below was extracted from the corresponding LV homepage footer — the LV
  // controls its own website, so the footer link IS the verification source.
  // Re-run the discovery script periodically to catch handle changes.

  // ─── Berlin (BE) ──────────────────────────────────────────────────────
  {
    lv: 'BE',
    platform: 'instagram',
    handle: 'gruene_berlin',
    country: 'DE',
    verifiedSource: 'https://gruene.berlin',
  },
  {
    lv: 'BE',
    platform: 'facebook',
    handle: 'Buendnis90DieGruenenBerlin',
    country: 'DE',
    verifiedSource: 'https://gruene.berlin',
  },

  // ─── Hamburg (HH) ─────────────────────────────────────────────────────
  {
    lv: 'HH',
    platform: 'instagram',
    handle: 'gruene_hamburg',
    country: 'DE',
    verifiedSource: 'https://www.gruene-hamburg.de',
  },
  {
    lv: 'HH',
    platform: 'facebook',
    handle: 'gruene.hamburg',
    country: 'DE',
    verifiedSource: 'https://www.gruene-hamburg.de',
  },

  // ─── Mecklenburg-Vorpommern (MV) ──────────────────────────────────────
  {
    lv: 'MV',
    platform: 'instagram',
    handle: 'gruenemv',
    country: 'DE',
    verifiedSource: 'https://gruene-mv.de',
  },
  {
    lv: 'MV',
    platform: 'facebook',
    handle: 'gruenemv',
    country: 'DE',
    verifiedSource: 'https://gruene-mv.de',
  },

  // ─── Thüringen (TH) ───────────────────────────────────────────────────
  {
    lv: 'TH',
    platform: 'instagram',
    handle: 'gruene_th',
    country: 'DE',
    verifiedSource: 'https://gruene-thueringen.de',
  },
  {
    lv: 'TH',
    platform: 'facebook',
    handle: 'gruenethueringen',
    country: 'DE',
    verifiedSource: 'https://gruene-thueringen.de',
  },

  // ─── Brandenburg (BB) ─────────────────────────────────────────────────
  {
    lv: 'BB',
    platform: 'instagram',
    handle: 'gruenebbg',
    country: 'DE',
    verifiedSource: 'https://gruene-brandenburg.de',
  },
  {
    lv: 'BB',
    platform: 'facebook',
    handle: 'gruenebbg',
    country: 'DE',
    verifiedSource: 'https://gruene-brandenburg.de',
  },

  // Nachgezogen 2026-08-13 über `scripts/discover-lv-social-handles.ts`, das
  // inzwischen für alle vier LVs eine Homepage erreicht (Bayern hat seit dem
  // ersten Seeding eine vollständige Scraper-Config). Jeder Handle stammt aus
  // dem Footer der jeweiligen LV-Seite — der LV kontrolliert seine Website,
  // der Footer-Link IST damit die Verifikationsquelle.

  // ─── Bayern (BY) ──────────────────────────────────────────────────────
  {
    lv: 'BY',
    platform: 'instagram',
    handle: 'gruenebayern',
    country: 'DE',
    verifiedSource: 'https://www.gruene-bayern.de',
  },
  {
    lv: 'BY',
    platform: 'facebook',
    handle: 'gruenebayern',
    country: 'DE',
    verifiedSource: 'https://www.gruene-bayern.de',
  },

  // ─── Hessen (HE) ──────────────────────────────────────────────────────
  {
    lv: 'HE',
    platform: 'instagram',
    handle: 'gruenehessen',
    country: 'DE',
    verifiedSource: 'https://www.gruene-hessen.de',
  },
  {
    lv: 'HE',
    platform: 'facebook',
    handle: 'gruenehessen',
    country: 'DE',
    verifiedSource: 'https://www.gruene-hessen.de',
  },

  // ─── Sachsen-Anhalt (LSA) ─────────────────────────────────────────────
  // Der Footer führt zusätzlich `sziborraseidlitz` (Spitzenkandidatin zur
  // Landtagswahl 2026). Ein Personen-Account ist kein LV-Account — er bleibt
  // draußen, sonst mischen sich zwei Stimmen im Stilkorpus.
  {
    lv: 'LSA',
    platform: 'instagram',
    handle: 'gruene_lsa',
    country: 'DE',
    verifiedSource: 'https://www.gruene-lsa.de',
  },
  {
    lv: 'LSA',
    platform: 'facebook',
    handle: 'GRUENELSA',
    country: 'DE',
    verifiedSource: 'https://www.gruene-lsa.de',
  },

  // ─── Saarland (SL) ────────────────────────────────────────────────────
  {
    lv: 'SL',
    platform: 'instagram',
    handle: 'gruene_saar',
    country: 'DE',
    verifiedSource: 'https://gruene-saar.de',
  },
  {
    lv: 'SL',
    platform: 'facebook',
    handle: 'GrueneSaar',
    country: 'DE',
    verifiedSource: 'https://gruene-saar.de',
  },

  // ─── Sachsen (SN) ─────────────────────────────────────────────────────
  // Handles verifiziert, Notebook aber `enabled: false` — kein Rezept, das
  // den Korpus bräuchte. Steht hier, damit ein Wiedereinschalten nichts
  // nachzuholen hat.
  {
    lv: 'SN',
    platform: 'instagram',
    handle: 'gruene_sachsen',
    country: 'DE',
    verifiedSource: 'https://gruene-sachsen.de',
  },
  {
    lv: 'SN',
    platform: 'facebook',
    handle: 'gruene.sachsen',
    country: 'DE',
    verifiedSource: 'https://gruene-sachsen.de',
  },

  // ─── TODO: Schleswig-Holstein (SH) ────────────────────────────────────
  // SH has no full scraper config in landesverbaendeConfig.ts (only PDF
  // sources for wahlprogramm.pdf), so discover-lv-social-handles.ts can't
  // reach a homepage. To populate: manually visit https://sh-gruene.de
  // and add IG + FB handles from the footer with verifiedSource set.
  // Note: PR-SH agent's notebook is currently `enabled: false` in web
  // anyway — low urgency.
] as const;
