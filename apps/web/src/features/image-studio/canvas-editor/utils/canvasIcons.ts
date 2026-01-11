/**
 * Utility to convert React Icons to image data URLs for use in Konva canvas
 */
import type { IconType } from 'react-icons';
import * as PI from 'react-icons/pi'; // Phosphor
import * as HI from 'react-icons/hi2'; // HeroIcons 2
import * as BI from 'react-icons/bi'; // Bootstrap Icons
import * as LU from 'react-icons/lu'; // Lucide
import * as IO5 from 'react-icons/io5'; // Ionicons 5
import * as GO from 'react-icons/go'; // Github Octicons
import * as FI from 'react-icons/fi'; // Feather

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
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

// Map of library prefix to full name
const LIBRARY_NAMES: Record<string, string> = {
    pi: 'Phosphor',
    hi: 'HeroIcons',
    bi: 'Bootstrap',
    lu: 'Lucide',
    io5: 'Ionicons',
    go: 'Octicons',
    fi: 'Feather',
};

// Dynamically build the list of all available icons
const ALL_ICONS_MAP: Record<string, IconDef> = {};
const ALL_ICONS_LIST: IconDef[] = [];

// Helper to format PascalCase into words
const formatName = (str: string) => str.replace(/([A-Z])/g, ' $1').trim();

// Process each library
const procesLibrary = (namespace: Record<string, IconType>, prefix: string) => {
    Object.entries(namespace).forEach(([key, component]) => {
        // Basic filter for valid icons (function check)
        if (typeof component !== 'function') return;

        // Skip specific known non-icon exports if any (react-icons usually clean)
        if (key === 'IconContext' || key === 'default') return;

        // Strip library naming conventions
        let namePart = key;
        const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);

        if (key.startsWith(capPrefix)) {
            namePart = key.slice(capPrefix.length);
        } else if (prefix === 'io5' && key.startsWith('Io')) {
            namePart = key.slice(2);
        }

        const id = `${prefix}-${namePart.toLowerCase()}`;

        // Format name from the stripped part
        const name = formatName(namePart);

        const def: IconDef = {
            id,
            name,
            component,
            library: LIBRARY_NAMES[prefix],
        };

        ALL_ICONS_MAP[id] = def;
        ALL_ICONS_LIST.push(def);
    });
};

// Execute processing
procesLibrary(PI, 'pi');
procesLibrary(HI, 'hi');
procesLibrary(BI, 'bi');
procesLibrary(LU, 'lu');
procesLibrary(IO5, 'io5');
procesLibrary(GO, 'go');
procesLibrary(FI, 'fi');

// Sort alphabetically by name
ALL_ICONS_LIST.sort((a, b) => a.name.localeCompare(b.name));

export const ALL_ICONS = ALL_ICONS_LIST;

// Default positions for placed icons
const DEFAULT_POSITIONS = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 300, y: 100 },
];

// Cache for generated data URLs
const dataUrlCache = new Map<string, string>();

/**
 * Generate a data URL for a React Icon
 */
export function generateIconDataUrl(
    iconId: string,
    size: number = 64,
    color: string = '#ffffff'
): string | null {
    const cacheKey = `${iconId}-${size}-${color}`;
    if (dataUrlCache.has(cacheKey)) {
        return dataUrlCache.get(cacheKey)!;
    }

    const iconDef = ALL_ICONS_MAP[iconId];
    if (!iconDef) {
        console.warn(`Icon not found: ${iconId}`);
        return null;
    }

    try {
        // Render icon to SVG string using react-icons/lib context potentially, 
        // but standard renderToStaticMarkup works for simple SVG icons
        const svgString = renderToStaticMarkup(
            createElement(iconDef.component, { size, color })
        );

        // Some icons might not output SVG directly if they are font-based, 
        // but react-icons are SVG-based.

        // Ensure we claim the namespace for SVG
        const svgWithNs = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');

        // Convert to data URL
        const dataUrl = `data:image/svg+xml;base64,${btoa(svgWithNs)}`;
        dataUrlCache.set(cacheKey, dataUrl);
        return dataUrl;
    } catch (error) {
        console.error(`Failed to generate icon data URL for ${iconId}:`, error);
        return null;
    }
}

/**
 * Build list of canvas icons from selected icon IDs
 */
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
        // Check if this icon already exists (preserve position/size)
        const existing = existingIcons.find(i => i.iconId === iconId);

        if (existing) {
            result.push(existing);
        } else {
            // Create new icon with default position
            const dataUrl = generateIconDataUrl(iconId, defaultSize * 2, defaultColor);
            if (dataUrl) {
                // Calculate position - spread icons across the canvas
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

/**
 * Get icon component by ID
 */
export function getIconComponent(iconId: string): IconType | null {
    return ALL_ICONS_MAP[iconId]?.component || null;
}
