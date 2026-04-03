/**
 * Canvas icon utilities powered by the Iconify API.
 *
 * Icons are fetched from a self-hosted Iconify API instance.
 * SVG data is fetched on demand and cached as base64 data URLs
 * for rendering on the Konva canvas.
 */

export interface CanvasIcon {
  id: string;
  iconId: string;
  dataUrl: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

export interface IconDef {
  id: string;
  name: string;
  library: string;
}

let iconifyApiUrl = '';

export function setIconifyApiUrl(url: string) {
  iconifyApiUrl = url.replace(/\/$/, '');
}

export function getIconifyApiUrl(): string {
  return iconifyApiUrl;
}

function getApiUrl(): string {
  if (!iconifyApiUrl) {
    throw new Error('Iconify API URL not configured. Call setIconifyApiUrl() first.');
  }
  return iconifyApiUrl;
}

// ---------------------------------------------------------------------------
// Icon metadata loading (names only, no SVG data)
// ---------------------------------------------------------------------------

let iconsList: IconDef[] | null = null;
let iconsMap: Record<string, IconDef> | null = null;
let loadPromise: Promise<IconDef[]> | null = null;

interface CollectionInfo {
  name: string;
  total: number;
  author: { name: string };
  category?: string;
}

interface CollectionIcons {
  prefix: string;
  icons: Record<string, unknown>;
}

const formatName = (str: string) =>
  str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/**
 * Load icon metadata from the Iconify API.
 * Fetches collection list, then icon names for each collection.
 * Only loads names — SVG data is fetched on demand.
 */
export function loadAllIcons(): Promise<IconDef[]> {
  if (iconsList) return Promise.resolve(iconsList);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const api = getApiUrl();
    const res = await fetch(`${api}/collections`);
    const collections: Record<string, CollectionInfo> = await res.json();

    const prefixes = Object.keys(collections);

    // Fetch icon names for all collections in parallel (batched)
    const BATCH_SIZE = 20;
    const map: Record<string, IconDef> = {};
    const list: IconDef[] = [];

    for (let i = 0; i < prefixes.length; i += BATCH_SIZE) {
      const batch = prefixes.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (prefix) => {
          try {
            const r = await fetch(`${api}/collection?prefix=${prefix}`);
            const data = await r.json();
            // The API returns uncategorized icons or categorized icons
            const iconNames: string[] = data.uncategorized ?? [];
            if (data.categories) {
              for (const names of Object.values(data.categories)) {
                iconNames.push(...(names as string[]));
              }
            }
            return { prefix, names: iconNames, library: collections[prefix].name };
          } catch {
            return { prefix, names: [] as string[], library: prefix };
          }
        })
      );

      for (const { prefix, names, library } of results) {
        for (const name of names) {
          const id = `${prefix}:${name}`;
          const def: IconDef = { id, name: formatName(name), library };
          map[id] = def;
          list.push(def);
        }
      }
    }

    list.sort((a, b) => a.name.localeCompare(b.name));
    iconsMap = map;
    iconsList = list;
    return list;
  })();

  return loadPromise;
}

export function getIconsSync(): IconDef[] | null {
  return iconsList;
}

export function getIconMapSync(): Record<string, IconDef> | null {
  return iconsMap;
}

// ---------------------------------------------------------------------------
// SVG data URL generation (fetches SVG from API on demand)
// ---------------------------------------------------------------------------

const dataUrlCache = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string | null>>();

/**
 * Fetch an icon's SVG from the Iconify API, apply color, and return as a base64 data URL.
 * Results are cached to avoid redundant fetches.
 */
export async function generateIconDataUrl(
  iconId: string,
  size: number = 64,
  color: string = '#ffffff'
): Promise<string | null> {
  const cacheKey = `${iconId}-${size}-${color}`;
  const cached = dataUrlCache.get(cacheKey);
  if (cached) return cached;

  // Deduplicate in-flight requests for the same icon+size+color
  const pending = pendingFetches.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const api = getApiUrl();
      const encodedColor = encodeURIComponent(color);
      const url = `${api}/${iconId}.svg?height=${size}&color=${encodedColor}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      let svgText = await res.text();
      // Ensure xmlns is present for data URL usage
      if (!svgText.includes('xmlns=')) {
        svgText = svgText.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const dataUrl = `data:image/svg+xml;base64,${btoa(svgText)}`;
      dataUrlCache.set(cacheKey, dataUrl);
      return dataUrl;
    } catch {
      return null;
    } finally {
      pendingFetches.delete(cacheKey);
    }
  })();

  pendingFetches.set(cacheKey, promise);
  return promise;
}

/**
 * Synchronous data URL lookup. Returns cached value or null if not yet fetched.
 * Use generateIconDataUrl() to trigger the fetch.
 */
export function getIconDataUrlSync(
  iconId: string,
  size: number = 64,
  color: string = '#ffffff'
): string | null {
  return dataUrlCache.get(`${iconId}-${size}-${color}`) ?? null;
}

// ---------------------------------------------------------------------------
// Search (delegates to Iconify API search endpoint)
// ---------------------------------------------------------------------------

export interface IconSearchResult {
  icons: IconDef[];
  total: number;
}

export async function searchIcons(query: string, limit: number = 64): Promise<IconSearchResult> {
  if (!query.trim()) return { icons: [], total: 0 };

  try {
    const api = getApiUrl();
    const res = await fetch(`${api}/search?query=${encodeURIComponent(query)}&limit=${limit}`);
    const data = await res.json();

    const icons: IconDef[] = (data.icons ?? []).map((id: string) => {
      const [prefix, ...nameParts] = id.split(':');
      const name = nameParts.join(':');
      return {
        id,
        name: formatName(name),
        library: prefix,
      };
    });

    return { icons, total: data.total ?? icons.length };
  } catch {
    return { icons: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// Canvas icon building (same interface as before)
// ---------------------------------------------------------------------------

const DEFAULT_POSITIONS = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 300, y: 100 },
];

export async function buildCanvasIcons(
  selectedIconIds: string[],
  existingIcons: CanvasIcon[] = [],
  defaultColor: string = '#ffffff',
  defaultSize: number = 64,
  stageWidth: number = 1080,
  stageHeight: number = 1080
): Promise<CanvasIcon[]> {
  const result: CanvasIcon[] = [];

  for (let index = 0; index < selectedIconIds.length; index++) {
    const iconId = selectedIconIds[index];
    const existing = existingIcons.find((i) => i.iconId === iconId);

    if (existing) {
      result.push(existing);
    } else {
      const dataUrl = await generateIconDataUrl(iconId, defaultSize * 2, defaultColor);
      if (dataUrl) {
        const defaultPos = DEFAULT_POSITIONS[index] || {
          x: stageWidth / 2 - defaultSize / 2,
          y: stageHeight / 2 - defaultSize / 2,
        };

        result.push({
          id: `icon-${iconId}-${Date.now()}`,
          iconId,
          dataUrl,
          x: defaultPos.x,
          y: defaultPos.y,
          size: defaultSize,
          color: defaultColor,
        });
      }
    }
  }

  return result;
}

/**
 * @deprecated Use `loadAllIcons()` + `getIconsSync()` instead.
 */
export const ALL_ICONS: IconDef[] = new Proxy([] as IconDef[], {
  get(target, prop) {
    if (iconsList && prop !== 'constructor') {
      return Reflect.get(iconsList, prop);
    }
    return Reflect.get(target, prop);
  },
});
