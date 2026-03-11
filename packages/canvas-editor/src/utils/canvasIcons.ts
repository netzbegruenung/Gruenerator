/**
 * Utility to convert React Icons to image data URLs for use in Konva canvas
 *
 * Icons are lazy-loaded to avoid pulling ~15,000 icons into the initial bundle.
 * Call `loadAllIcons()` to trigger loading; use `getIconsSync()` / `getIconMapSync()`
 * for render-time access after icons have been loaded.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { IconType } from 'react-icons';
export type { IconType };

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
  component: IconType;
  library: string;
}

const LIBRARY_NAMES: Record<string, string> = {
  pi: 'Phosphor',
  hi: 'HeroIcons',
  bi: 'Bootstrap',
  lu: 'Lucide',
  io5: 'Ionicons',
  go: 'Octicons',
  fi: 'Feather',
};

let iconsMap: Record<string, IconDef> | null = null;
let iconsList: IconDef[] | null = null;
let loadPromise: Promise<IconDef[]> | null = null;

const formatName = (str: string) => str.replace(/([A-Z])/g, ' $1').trim();

function processLibrary(
  namespace: Record<string, IconType>,
  prefix: string,
  map: Record<string, IconDef>,
  list: IconDef[]
) {
  Object.entries(namespace).forEach(([key, component]) => {
    if (typeof component !== 'function') return;
    if (key === 'IconContext' || key === 'default') return;

    let namePart = key;
    const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);

    if (key.startsWith(capPrefix)) {
      namePart = key.slice(capPrefix.length);
    } else if (prefix === 'io5' && key.startsWith('Io')) {
      namePart = key.slice(2);
    }

    const id = `${prefix}-${namePart.toLowerCase()}`;
    const name = formatName(namePart);

    const def: IconDef = {
      id,
      name,
      component,
      library: LIBRARY_NAMES[prefix],
    };

    map[id] = def;
    list.push(def);
  });
}

/**
 * Lazily load all icon libraries. Returns the same promise if called multiple times.
 * After resolution, `getIconsSync()` and `getIconMapSync()` return data synchronously.
 */
export function loadAllIcons(): Promise<IconDef[]> {
  if (iconsList) return Promise.resolve(iconsList);
  if (loadPromise) return loadPromise;

  loadPromise = Promise.all([
    import('react-icons/pi'),
    import('react-icons/hi2'),
    import('react-icons/bi'),
    import('react-icons/lu'),
    import('react-icons/io5'),
    import('react-icons/go'),
    import('react-icons/fi'),
  ]).then(([PI, HI, BI, LU, IO5, GO, FI]) => {
    const map: Record<string, IconDef> = {};
    const list: IconDef[] = [];

    processLibrary(PI as unknown as Record<string, IconType>, 'pi', map, list);
    processLibrary(HI as unknown as Record<string, IconType>, 'hi', map, list);
    processLibrary(BI as unknown as Record<string, IconType>, 'bi', map, list);
    processLibrary(LU as unknown as Record<string, IconType>, 'lu', map, list);
    processLibrary(IO5 as unknown as Record<string, IconType>, 'io5', map, list);
    processLibrary(GO as unknown as Record<string, IconType>, 'go', map, list);
    processLibrary(FI as unknown as Record<string, IconType>, 'fi', map, list);

    list.sort((a, b) => a.name.localeCompare(b.name));

    iconsMap = map;
    iconsList = list;
    return list;
  });

  return loadPromise;
}

/**
 * Synchronous access to icons list. Returns null if not yet loaded.
 */
export function getIconsSync(): IconDef[] | null {
  return iconsList;
}

/**
 * Synchronous access to icons map. Returns null if not yet loaded.
 */
export function getIconMapSync(): Record<string, IconDef> | null {
  return iconsMap;
}

/**
 * @deprecated Use `loadAllIcons()` + `getIconsSync()` instead.
 * Kept for backward compatibility — returns empty array before icons are loaded.
 */
export const ALL_ICONS: IconDef[] = new Proxy([] as IconDef[], {
  get(target, prop) {
    if (iconsList && prop !== 'constructor') {
      return Reflect.get(iconsList, prop);
    }
    return Reflect.get(target, prop);
  },
});

const DEFAULT_POSITIONS = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 300, y: 100 },
];

const dataUrlCache = new Map<string, string>();

export function generateIconDataUrl(
  iconId: string,
  size: number = 64,
  color: string = '#ffffff'
): string | null {
  const cacheKey = `${iconId}-${size}-${color}`;
  if (dataUrlCache.has(cacheKey)) {
    return dataUrlCache.get(cacheKey)!;
  }

  const iconDef = iconsMap?.[iconId];
  if (!iconDef) {
    console.warn(`Icon not found: ${iconId}`);
    return null;
  }

  try {
    const svgString = renderToStaticMarkup(createElement(iconDef.component, { size, color }));
    const svgWithNs = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const dataUrl = `data:image/svg+xml;base64,${btoa(svgWithNs)}`;
    dataUrlCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (error) {
    console.error(`Failed to generate icon data URL for ${iconId}:`, error);
    return null;
  }
}

export function buildCanvasIcons(
  selectedIconIds: string[],
  existingIcons: CanvasIcon[] = [],
  defaultColor: string = '#ffffff',
  defaultSize: number = 64,
  stageWidth: number = 1080,
  stageHeight: number = 1080
): CanvasIcon[] {
  const result: CanvasIcon[] = [];

  selectedIconIds.forEach((iconId, index) => {
    const existing = existingIcons.find((i) => i.iconId === iconId);

    if (existing) {
      result.push(existing);
    } else {
      const dataUrl = generateIconDataUrl(iconId, defaultSize * 2, defaultColor);
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
  });

  return result;
}

export function getIconComponent(iconId: string): IconType | null {
  return iconsMap?.[iconId]?.component || null;
}
