/**
 * Typed registry of Landesverband scraper source IDs and curated-list IDs.
 *
 * Single source of truth shared by the scraper config (`apps/api/config/landesverbaendeConfig.ts`),
 * the system-collection config (`apps/api/config/systemCollectionsConfig.ts`), and the shared
 * collections config (`./config.ts`). All three must agree on which IDs exist.
 *
 * Adding a new scraper: extend `LANDESVERBAND_SOURCE_IDS` here first. The literal-type union
 * derived from this tuple then constrains both `LandesverbandSource.id` and every
 * `valueLabels` key for the `source_id` filter — typos surface at compile time.
 */

export const LANDESVERBAND_SOURCE_IDS = [
  'berlin-lv-presse',
  'berlin-lv-beschluesse',
  'berlin-fraktion-presse',
  'berlin-fraktion-beschluesse',
  'hamburg-lv-presse',
  'hamburg-lv-beschluesse',
  'mecklenburg-vorpommern-lv',
  'mecklenburg-vorpommern-fraktion',
  'thueringen-lv',
  'thueringen-lv-wahlprogramme',
  'thueringen-fraktion',
  'brandenburg-lv',
  'brandenburg-archive-presse',
  'brandenburg-archive-beschluesse',
  'bayern-lv',
  'schleswig-holstein-lv',
  'sachsen-anhalt-lv',
  'sachsen-anhalt-fraktion',
] as const satisfies readonly string[];

export type LandesverbandSourceId = (typeof LANDESVERBAND_SOURCE_IDS)[number];

export const CURATED_LIST_IDS = ['wahlprogramm-be'] as const satisfies readonly string[];

export type CuratedListId = (typeof CURATED_LIST_IDS)[number];

/**
 * Canonical content-type vocabulary used across every Landesverband collection.
 *
 * Scrapers write these literal values into the Qdrant payload `content_type` field
 * (see `apps/api/config/landesverbaendeConfig.ts → type ContentType`). Unifying the
 * labels here means every LV's "Typ" dropdown reads the same way to users: a press
 * release from Hamburg, Berlin, or Brandenburg all surface under "Pressemitteilungen".
 */
export const LANDESVERBAND_CONTENT_TYPES = [
  'presse',
  'beschluss',
  'antrag',
  'blog',
  'wahlprogramm',
] as const satisfies readonly string[];

export type LandesverbandContentType = (typeof LANDESVERBAND_CONTENT_TYPES)[number];

export const LV_CONTENT_TYPE_LABELS: Record<LandesverbandContentType, string> = {
  presse: 'Pressemitteilungen',
  beschluss: 'Beschlüsse',
  antrag: 'Anträge',
  blog: 'Blog',
  wahlprogramm: 'Wahlprogramme',
};

/**
 * Organisational source-type — Landesverband (state party) vs. Fraktion (parliamentary group).
 *
 * Scrapers write this into the Qdrant payload `source_type` field. Surface it as a
 * filter only on LVs that have BOTH (Berlin, MV, Thüringen) — for LVs with a single
 * organ the dropdown would render one entry.
 */
export const LANDESVERBAND_SOURCE_TYPES = [
  'landesverband',
  'fraktion',
] as const satisfies readonly string[];

export type LandesverbandSourceType = (typeof LANDESVERBAND_SOURCE_TYPES)[number];

export const LV_SOURCE_TYPE_LABELS: Record<LandesverbandSourceType, string> = {
  landesverband: 'Landesverband',
  fraktion: 'Fraktion',
};

/**
 * Closed set of Qdrant payload field names that may be declared as filterable
 * in any collection config. Adding a new filter axis (e.g. `gremium`, `platform`)
 * means extending this tuple first — the union below then forces every
 * declaration site (api `FilterableField`, shared `CollectionConfig`, Zod
 * contract response, frontend cache) to acknowledge the new field.
 */
export const FILTERABLE_FIELD_NAMES = [
  'primary_category',
  'content_type',
  'subcategories',
  'country',
  'region',
  'landesverband',
  'gremium',
  'source_id',
  'source_type',
  'curated_lists',
  'platform',
  'published_at',
] as const satisfies readonly string[];

export type FilterableFieldName = (typeof FILTERABLE_FIELD_NAMES)[number];

/**
 * Conditional type that pins `valueLabels` keys to the typed union appropriate
 * for each filter field. Declaring `{ field: 'source_id', valueLabels: { 'wrong-id': '…' } }`
 * fails at compile time; declaring `{ field: 'curated_lists', valueLabels: ... }`
 * accepts only `CuratedListId` keys; declarations for fields without a typed
 * vocabulary fall back to `Record<string, string>`.
 */
export type ValueLabelsFor<F extends FilterableFieldName> = F extends 'source_id'
  ? Partial<Record<LandesverbandSourceId, string>>
  : F extends 'curated_lists'
    ? Partial<Record<CuratedListId, string>>
    : F extends 'source_type'
      ? Partial<Record<LandesverbandSourceType, string>>
      : F extends 'content_type'
        ? Partial<Record<LandesverbandContentType, string>>
        : Record<string, string>;
