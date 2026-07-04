/**
 * Runtime collection catalog: fetched from the backend (`GET /api/v1/collections`)
 * at boot + on a TTL, with a static fallback so search works when the API is
 * unreachable. The internal shape mirrors the old shared `CollectionConfig`
 * (keyed `filterableFields`, `name` = Qdrant collection); the array→keyed-object
 * adaptation happens at the fetch boundary so existing consumers read it unchanged.
 */

import { type QdrantFilter } from '@gruenerator/shared/search/filters';

export interface McpFilterableField {
  label: string;
  type: string;
  valueLabels?: Record<string, string>;
}

export interface McpCollection {
  /** Qdrant collection name (kept as `name` for consumer back-compat). */
  name: string;
  displayName: string;
  description: string;
  filterableFields: Record<string, McpFilterableField>;
  country?: 'DE' | 'AT';
  includeInDefaultSearch?: boolean;
  defaultFilter?: { field: string; value: string | string[] };
}

export type McpCatalog = Record<string, McpCollection>;

/** Shape returned by `GET /api/v1/collections` (array filterableFields). */
interface SerializedCollection {
  key: string;
  qdrantCollection: string;
  displayName: string;
  description: string;
  country?: 'DE' | 'AT';
  includeInDefaultSearch: boolean;
  defaultFilter?: { field: string; value: string | string[] };
  filterableFields: Array<{
    field: string;
    label: string;
    type: string;
    valueLabels?: Record<string, string>;
  }>;
}

const lv = (displayName: string, description: string, value: string | string[]): McpCollection => ({
  name: 'landesverbaende_documents',
  displayName,
  description,
  filterableFields: {},
  country: 'DE',
  includeInDefaultSearch: false,
  defaultFilter: { field: 'landesverband', value },
});

// Offline fallback for the mcpExposed collections. filterableFields intentionally
// empty — search works without them; the live catalog carries the full metadata.
const STATIC_CATALOG: McpCatalog = {
  deutschland: {
    name: 'grundsatz_documents',
    displayName: 'Grüne Grundsatzprogramme',
    description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
    filterableFields: {},
    country: 'DE',
    includeInDefaultSearch: true,
  },
  bundestagsfraktion: {
    name: 'bundestag_content',
    displayName: 'Grüne Bundestagsfraktion',
    description: 'Fachtexte, Ziele und Positionen von gruene-bundestag.de',
    filterableFields: {},
    country: 'DE',
    includeInDefaultSearch: true,
  },
  oesterreich: {
    name: 'oesterreich_gruene_documents',
    displayName: 'Die Grünen Österreich',
    description: 'Programme der Grünen – Die Grüne Alternative Österreich',
    filterableFields: {},
    country: 'AT',
    includeInDefaultSearch: true,
  },
  abgeordnetenwatch: {
    name: 'abgeordnetenwatch_documents',
    displayName: 'Abgeordnetenwatch',
    description:
      'Namentliche Abstimmungen (mit Grünen-Votum) und Nebentätigkeiten von Abgeordneten',
    filterableFields: {},
    country: 'DE',
    includeInDefaultSearch: false,
  },
  'gruene-de': {
    name: 'gruene_de_documents',
    displayName: 'Grüne Deutschland (gruene.de)',
    description: 'Inhalte von gruene.de – Positionen, Themen und Aktuelles',
    filterableFields: {},
    country: 'DE',
    includeInDefaultSearch: true,
  },
  kommunalwiki: {
    name: 'kommunalwiki_documents',
    displayName: 'KommunalWiki',
    description: 'Fachwissen zur Kommunalpolitik (Heinrich-Böll-Stiftung)',
    filterableFields: {},
    includeInDefaultSearch: true,
  },
  'gruene-at': {
    name: 'gruene_at_documents',
    displayName: 'Grüne Österreich (gruene.at)',
    description: 'Inhalte von gruene.at – Positionen, Themen und Aktuelles',
    filterableFields: {},
    country: 'AT',
    includeInDefaultSearch: true,
  },
  gruenblog: {
    name: 'gruenblog_documents',
    displayName: 'Grünblog',
    description: 'Onlinemagazin der Grünen – Artikel zu Wissen, Meinen, Machen',
    filterableFields: {},
    country: 'DE',
    includeInDefaultSearch: true,
  },
  'boell-stiftung': {
    name: 'boell_stiftung_documents',
    displayName: 'Heinrich-Böll-Stiftung',
    description: 'Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung',
    filterableFields: {},
    includeInDefaultSearch: true,
  },
  satzungen: {
    name: 'satzungen_documents',
    displayName: 'Satzungen',
    description: 'Satzungen der Kreisverbände und Ortsverbände',
    filterableFields: {},
    includeInDefaultSearch: false,
  },
  examples: {
    name: 'social_media_examples',
    displayName: 'Social Media Beispiele',
    description: 'Erfolgreiche Instagram- und Facebook-Posts als Inspiration für eigene Inhalte',
    filterableFields: {},
    includeInDefaultSearch: false,
  },
  hamburg: lv('Grüne Hamburg', 'Beschlüsse und Pressemitteilungen der Grünen Hamburg', 'HH'),
  'schleswig-holstein': lv(
    'Grüne Schleswig-Holstein',
    'Wahlprogramm der Grünen Schleswig-Holstein zur Landtagswahl',
    'SH'
  ),
  thueringen: lv(
    'Grüne Thüringen',
    'Beschlüsse, Wahlprogramme und Pressemitteilungen der Grünen Thüringen',
    ['TH', 'TH-F']
  ),
  bayern: lv(
    'Grüne Bayern',
    'Pressemitteilungen, Beschlüsse und Regierungsprogramm der Grünen Bayern (Landesverband & Fraktion)',
    ['BY', 'BY-F']
  ),
  berlin: lv(
    'Grüne Berlin',
    'Pressemitteilungen und Beschlüsse der Grünen Berlin (Landesverband & Fraktion)',
    ['BE', 'BE-F']
  ),
  'mecklenburg-vorpommern': lv(
    'Grüne Mecklenburg-Vorpommern',
    'Pressemitteilungen und Parteitagsbeschlüsse der Grünen Mecklenburg-Vorpommern',
    'MV'
  ),
  brandenburg: lv(
    'Grüne Brandenburg',
    'Pressemitteilungen, Beschlüsse und Landtagswahlprogramm 2024 der Grünen Brandenburg',
    'BB'
  ),
  'sachsen-anhalt': lv(
    'Grüne Sachsen-Anhalt',
    'Pressemitteilungen, Beschlüsse und Landtagswahlprogramm 2026 der Grünen Sachsen-Anhalt (Landesverband & Fraktion)',
    ['LSA', 'LSA-F']
  ),
  hessen: lv(
    'Grüne Hessen',
    'Pressemitteilungen und Beschlüsse der Grünen Hessen (Landesverband & Fraktion)',
    ['HE', 'HE-F']
  ),
};

const CATALOG_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FETCH_TIMEOUT_MS = 4000;

let currentCatalog: McpCatalog = STATIC_CATALOG;
let lastFetchedAt = 0;
let inFlight: Promise<void> | null = null;

function toMcpCollection(c: SerializedCollection): McpCollection {
  const filterableFields: Record<string, McpFilterableField> = {};
  for (const f of c.filterableFields) {
    filterableFields[f.field] = {
      label: f.label,
      type: f.type,
      ...(f.valueLabels ? { valueLabels: f.valueLabels } : {}),
    };
  }
  return {
    name: c.qdrantCollection,
    displayName: c.displayName,
    description: c.description,
    filterableFields,
    ...(c.country ? { country: c.country } : {}),
    includeInDefaultSearch: c.includeInDefaultSearch,
    ...(c.defaultFilter ? { defaultFilter: c.defaultFilter } : {}),
  };
}

// Never throws — keeps the previous catalog on any failure. Reads process.env
// directly to avoid a config↔catalog import cycle.
export async function fetchCatalog(): Promise<void> {
  if (inFlight) return inFlight;
  const baseUrl = process.env.GRUENERATOR_API_URL;
  if (!baseUrl) {
    console.error(
      '[Catalog] GRUENERATOR_API_URL not set — using static fallback catalog. ' +
        'New collections will not be picked up until it is configured.'
    );
    return;
  }

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/api/v1/collections`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(`[Catalog] Fetch failed: HTTP ${res.status} — keeping current catalog.`);
        return;
      }
      const data = (await res.json()) as { collections?: SerializedCollection[] };
      if (!Array.isArray(data.collections) || data.collections.length === 0) {
        console.error('[Catalog] Empty/invalid response — keeping current catalog.');
        return;
      }
      const next: McpCatalog = {};
      for (const c of data.collections) next[c.key] = toMcpCollection(c);
      currentCatalog = next;
      lastFetchedAt = Date.now();
      console.error(`[Catalog] Loaded ${data.collections.length} collections from API.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[Catalog] Fetch error (${detail}) — keeping current catalog.`);
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();
  return inFlight;
}

// Triggers a non-blocking background refresh when the TTL has expired.
export function getCatalog(): McpCatalog {
  if (Date.now() - lastFetchedAt > CATALOG_TTL_MS && !inFlight) {
    void fetchCatalog();
  }
  return currentCatalog;
}

/** Chat/user-facing collection keys currently known to the catalog. */
export function getCollectionKeys(): string[] {
  return Object.keys(getCatalog());
}

export function isValidCollectionKey(key: string): boolean {
  return key in getCatalog();
}

export function getQdrantCollectionName(key: string): string | undefined {
  return getCatalog()[key]?.name;
}

export function getDefaultSearchCollections(country: 'DE' | 'AT'): string[] {
  return Object.entries(getCatalog())
    .filter(([, col]) => {
      if (!col.includeInDefaultSearch) return false;
      if (!col.country) return true;
      return col.country === country;
    })
    .map(([key]) => key);
}

export function buildCollectionDefaultFilter(key: string): QdrantFilter | null {
  const col = getCatalog()[key];
  if (!col?.defaultFilter) return null;
  const { field, value } = col.defaultFilter;
  if (Array.isArray(value)) {
    return { must: [{ key: field, match: { any: value } }] };
  }
  return { must: [{ key: field, match: { value } }] };
}
