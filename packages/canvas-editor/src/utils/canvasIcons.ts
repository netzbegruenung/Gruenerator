/**
 * Canvas icon utilities powered by bundled Iconify icon sets.
 *
 * Icons come from local `@iconify-json/*` sets (Tabler, Flowbite) — no network
 * calls. Each set's data is lazy-imported the first time the picker or a canvas
 * icon needs it, so each lands in its own chunk. SVGs are generated locally via
 * `@iconify/utils`, colorized, and cached as base64 data URLs for rendering on
 * the Konva canvas.
 */

import { addCollection } from '@iconify/react';
import { getIconData, iconToSVG } from '@iconify/utils';

import { type IconifyJSON } from '@iconify-json/tabler';

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

// ---------------------------------------------------------------------------
// Bundled icon sets. `load` uses a literal import() so the bundler can
// code-split each set into its own lazy chunk. To add a set, append here.
// ---------------------------------------------------------------------------

interface IconSet {
  prefix: string;
  library: string;
  load: () => Promise<{ icons: IconifyJSON }>;
}

const ICON_SETS: IconSet[] = [
  { prefix: 'tabler', library: 'Tabler', load: () => import('@iconify-json/tabler') },
  { prefix: 'flowbite', library: 'Flowbite', load: () => import('@iconify-json/flowbite') },
  { prefix: 'lucide', library: 'Lucide', load: () => import('@iconify-json/lucide') },
  { prefix: 'heroicons', library: 'Heroicons', load: () => import('@iconify-json/heroicons') },
  { prefix: 'iconoir', library: 'Iconoir', load: () => import('@iconify-json/iconoir') },
  { prefix: 'bi', library: 'Bootstrap Icons', load: () => import('@iconify-json/bi') },
  { prefix: 'ri', library: 'Remix Icon', load: () => import('@iconify-json/ri') },
];

/** Split a `prefix:name` id; unprefixed ids default to the first set. */
function splitIconId(iconId: string): { prefix: string; name: string } {
  const colon = iconId.indexOf(':');
  if (colon === -1) return { prefix: ICON_SETS[0].prefix, name: iconId };
  return { prefix: iconId.slice(0, colon), name: iconId.slice(colon + 1) };
}

const toIconName = (iconId: string) => splitIconId(iconId).name;

// ---------------------------------------------------------------------------
// Per-set data loading (lazy dynamic import, registered with @iconify/react)
// ---------------------------------------------------------------------------

const setData = new Map<string, IconifyJSON>();
const setPromises = new Map<string, Promise<IconifyJSON>>();

function loadIconSet(set: IconSet): Promise<IconifyJSON> {
  const existing = setData.get(set.prefix);
  if (existing) return Promise.resolve(existing);
  const pending = setPromises.get(set.prefix);
  if (pending) return pending;

  const promise = set
    .load()
    .then(({ icons }) => {
      setData.set(set.prefix, icons);
      // Register so <Icon icon="prefix:..."> in the sidebar renders offline.
      addCollection(icons);
      return icons;
    })
    .catch((err) => {
      // Don't cache a rejected chunk load — clear it so a later call retries.
      setPromises.delete(set.prefix);
      throw err;
    });

  setPromises.set(set.prefix, promise);
  return promise;
}

function loadSetByPrefix(prefix: string): Promise<IconifyJSON> | null {
  const set = ICON_SETS.find((s) => s.prefix === prefix);
  return set ? loadIconSet(set) : null;
}

// ---------------------------------------------------------------------------
// Icon metadata loading (names only, no SVG data)
// ---------------------------------------------------------------------------

/** The set browsed by default when the picker opens (loads eagerly, alone). */
export const DEFAULT_ICON_SET = ICON_SETS[0].prefix;

// Per-set catalogs (names only). Each set is built lazily the first time it is
// browsed, so the picker's first open only pays for the default set.
const catalogBySet = new Map<string, IconDef[]>();
const catalogPromises = new Map<string, Promise<IconDef[]>>();
let syncList: IconDef[] | null = null;
let syncMap: Record<string, IconDef> | null = null;

const formatName = (str: string) =>
  str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** Recompute the combined sync views from all currently-loaded sets. */
function rebuildSyncViews() {
  const list: IconDef[] = [];
  const map: Record<string, IconDef> = {};
  for (const { prefix } of ICON_SETS) {
    const catalog = catalogBySet.get(prefix);
    if (!catalog) continue;
    for (const def of catalog) {
      list.push(def);
      map[def.id] = def;
    }
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  syncList = list;
  syncMap = map;
}

/**
 * Build the browsable catalog for a single set (names only; SVG data is
 * generated on demand). Cached; a failed load is not cached so it can retry.
 */
export function loadIconSetCatalog(prefix: string): Promise<IconDef[]> {
  const cached = catalogBySet.get(prefix);
  if (cached) return Promise.resolve(cached);
  const pending = catalogPromises.get(prefix);
  if (pending) return pending;

  const set = ICON_SETS.find((s) => s.prefix === prefix);
  if (!set) return Promise.resolve([]);

  const promise = loadIconSet(set)
    .then((data) => {
      const names = [...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})];
      const list = names.map((name) => ({
        id: `${set.prefix}:${name}`,
        name: formatName(name),
        library: set.library,
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      catalogBySet.set(set.prefix, list);
      rebuildSyncViews();
      return list;
    })
    .catch((err) => {
      catalogPromises.delete(set.prefix);
      throw err;
    });

  catalogPromises.set(set.prefix, promise);
  return promise;
}

/** Synchronous per-set catalog lookup (null until that set has been loaded). */
export function getIconSetCatalogSync(prefix: string): IconDef[] | null {
  return catalogBySet.get(prefix) ?? null;
}

/**
 * Load every set and return the combined catalog. Used by cross-set search —
 * NOT on picker mount, so the common browse path only loads the default set.
 */
export function loadAllIcons(): Promise<IconDef[]> {
  return Promise.all(ICON_SETS.map((s) => loadIconSetCatalog(s.prefix))).then(() => syncList ?? []);
}

export function getIconsSync(): IconDef[] | null {
  return syncList;
}

export function getIconMapSync(): Record<string, IconDef> | null {
  return syncMap;
}

// ---------------------------------------------------------------------------
// SVG data URL generation (renders Tabler SVG locally on demand)
// ---------------------------------------------------------------------------

const dataUrlCache = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string | null>>();

/**
 * Render a Tabler icon to a colorized base64 SVG data URL.
 * Results are cached to avoid redundant work.
 */
export async function generateIconDataUrl(
  iconId: string,
  size: number = 64,
  color: string = '#ffffff'
): Promise<string | null> {
  const cacheKey = `${iconId}-${size}-${color}`;
  const cached = dataUrlCache.get(cacheKey);
  if (cached) return cached;

  // Deduplicate in-flight work for the same icon+size+color
  const pending = pendingFetches.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const { prefix, name } = splitIconId(iconId);
      const setPromise = loadSetByPrefix(prefix);
      if (!setPromise) return null;
      const data = await setPromise;
      const iconData = getIconData(data, name);
      if (!iconData) return null;

      const rendered = iconToSVG(iconData, { height: size });
      const attributes = Object.entries(rendered.attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      // Iconify sets use currentColor for stroke/fill — bake the color in.
      const body = rendered.body.replace(/currentColor/g, color);
      const svgText = `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;

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
 * Synchronous data URL lookup. Returns cached value or null if not yet built.
 * Use generateIconDataUrl() to trigger generation.
 */
export function getIconDataUrlSync(
  iconId: string,
  size: number = 64,
  color: string = '#ffffff'
): string | null {
  return dataUrlCache.get(`${iconId}-${size}-${color}`) ?? null;
}

// ---------------------------------------------------------------------------
// Search (local filter over the bundled catalog)
// ---------------------------------------------------------------------------

export interface IconSearchResult {
  icons: IconDef[];
  total: number;
}

export async function searchIcons(query: string, limit: number = 64): Promise<IconSearchResult> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return { icons: [], total: 0 };

  const all = await loadAllIcons();
  // Match the bare icon name (e.g. "heart-filled"), NOT the full id — every id
  // shares the "tabler:" prefix, so matching the id would return the whole
  // catalog for any query that is a substring of "tabler:".
  const matches = all.filter(
    (icon) => icon.name.toLowerCase().includes(trimmed) || toIconName(icon.id).includes(trimmed)
  );

  return { icons: matches.slice(0, limit), total: matches.length };
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
    if (syncList && prop !== 'constructor') {
      return Reflect.get(syncList, prop);
    }
    return Reflect.get(target, prop);
  },
});
