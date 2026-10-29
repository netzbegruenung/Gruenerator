// SPDX-License-Identifier: MPL-2.0
import type { IconType } from 'react-icons';

/**
 * The sidebar tab ids the editor itself knows.
 *
 * Unified tabs (used in heterogeneous multi-page):
 * - 'text': Text editing section
 * - 'elements': Decorative elements (icons, shapes, illustrations)
 * - 'share': Export and sharing options
 *
 * Legacy tabs (template-specific, being migrated):
 * - 'assets': Elements section (→ 'elements')
 * - 'position': template-specific position controls
 * - 'fontsize': Deprecated - merged into 'text'
 */
export type CoreSidebarTabId =
  // Unified tab IDs (used in heterogeneous multi-page mode)
  | 'text'
  | 'elements'
  | 'share'
  | 'uploads'
  | 'tools'
  | 'chat'
  // Editor-level: the whole document, not a page (components/CanvasEditor/vorlagenTab.ts)
  | 'vorlagen'
  // Editor-level: every element of the active page (components/CanvasEditor/layersTab.ts)
  | 'layers'
  // Legacy/template-specific tab IDs (for backwards compatibility)
  | 'fontsize'
  | 'assets'
  | 'position'
  | 'settings'
  | 'frame-settings'
  | 'chart-settings'
  | 'image-adjust'
  | 'design';

/**
 * A sidebar tab id: one the editor knows, or one a host's config brings with
 * its own section. `string & {}` keeps the core ids as completions.
 */
export type SidebarTabId = CoreSidebarTabId | (string & {});

export interface SidebarTab {
  id: SidebarTabId;
  icon: IconType;
  label: string;
  ariaLabel: string;
}

export { type BackgroundColorOption } from '@ggraphic/core';
