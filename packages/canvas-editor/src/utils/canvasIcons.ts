/**
 * Canvas icon utilities powered by the bundled Tabler icon set.
 *
 * Icons come from `@iconify-json/tabler` (offline IconifyJSON) — no network
 * calls. The ~2 MB icon data is lazy-imported the first time the picker or a
 * canvas icon needs it, so it lands in its own chunk. SVGs are generated
 * locally via `@iconify/utils`, colorized, and cached as base64 data URLs for
 * rendering on the Konva canvas.
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

const TABLER_PREFIX = 'tabler';
const TABLER_LIBRARY = 'Tabler';

/** Strip the `tabler:` prefix (if present) to get the bare icon name. */
function toIconName(iconId: string): string {
  const colon = iconId.indexOf(':');
  return colon === -1 ? iconId : iconId.slice(colon + 1);
}

// ---------------------------------------------------------------------------
// Tabler data loading (lazy dynamic import, registered with @iconify/react)
// ---------------------------------------------------------------------------

let tablerData: IconifyJSON | null = null;
let tablerPromise: Promise<IconifyJSON> | null = null;

function loadTablerData(): Promise<IconifyJSON> {
  if (tablerData) return Promise.resolve(tablerData);
  if (tablerPromise) return tablerPromise;

  tablerPromise = import('@iconify-json/tabler').then(({ icons }) => {
    tablerData = icons;
    // Register so <Icon icon="tabler:..."> in the sidebar renders offline.
    addCollection(icons);
    return icons;
  });

  return tablerPromise;
}

// ---------------------------------------------------------------------------
// Icon metadata loading (names only, no SVG data)
// ---------------------------------------------------------------------------

let iconsList: IconDef[] | null = null;
let iconsMap: Record<string, IconDef> | null = null;
let loadPromise: Promise<IconDef[]> | null = null;

const formatName = (str: string) =>
  str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/**
 * Build the browsable icon catalog from the bundled Tabler set.
 * Only names are exposed here — SVG data is generated on demand.
 */
export function loadAllIcons(): Promise<IconDef[]> {
  if (iconsList) return Promise.resolve(iconsList);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const data = await loadTablerData();

    const names = [...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})];
    const map: Record<string, IconDef> = {};
    const list: IconDef[] = [];

    for (const name of names) {
      const id = `${TABLER_PREFIX}:${name}`;
      const def: IconDef = { id, name: formatName(name), library: TABLER_LIBRARY };
      map[id] = def;
      list.push(def);
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
      const data = await loadTablerData();
      const iconData = getIconData(data, toIconName(iconId));
      if (!iconData) return null;

      const rendered = iconToSVG(iconData, { height: size });
      const attributes = Object.entries(rendered.attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      // Tabler icons use currentColor for stroke/fill — bake the color in.
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
  const matches = all.filter(
    (icon) => icon.name.toLowerCase().includes(trimmed) || icon.id.includes(trimmed)
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
    if (iconsList && prop !== 'constructor') {
      return Reflect.get(iconsList, prop);
    }
    return Reflect.get(target, prop);
  },
});
