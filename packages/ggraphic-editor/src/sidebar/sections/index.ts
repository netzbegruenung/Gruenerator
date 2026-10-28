// SPDX-License-Identifier: MPL-2.0
/**
 * The core's sidebar sections, for template configs to list.
 *
 * Exports are split into static and lazy-loaded sections:
 * - Lightweight sections are exported directly
 * - Heavy sections are lazy-loaded with React.lazy() to reduce initial bundle size
 *
 * The lazy wrappers exist once, here: a host barrel re-exports them, so a
 * preload (`AssetsSection.preload()`) warms the same component the config renders.
 */

import { lazy } from 'react';

import { lazyWithPreload } from './lazyWithPreload.js';

// =============================================================================
// STATIC EXPORTS - Lightweight sections loaded immediately
// =============================================================================

export { CombinedTextSection } from './CombinedTextSection.js';
export type { CombinedTextSectionProps } from './CombinedTextSection.js';
// Static: IconsSection used to be statically imported by AssetsSection, so the
// previous lazy() wrapper was an ineffective dynamic import
// (it confused the chunker). Export it directly.
export { IconsSection } from './IconsSection.js';
export { FrameSettingsSection } from './FrameSettingsSection.js';
export type { FrameSettingsSectionProps } from './FrameSettingsSection.js';
export { FormenSection } from './FormenSection.js';
export type { FormenSectionProps } from './FormenSection.js';

// =============================================================================
// LAZY EXPORTS - Heavy sections loaded on-demand
// =============================================================================

// Preloaded while the editor is idle (usePreloadElements), so the first open is instant.
export const AssetsSection = lazyWithPreload(() =>
  import('./assets/index.js').then((m) => m.AssetsSection)
);

export const GenericShareSection = lazy(() =>
  import('./GenericShareSection.js').then((m) => ({
    default: m.GenericShareSection,
  }))
);
export type { GenericShareSectionProps } from './GenericShareSection.js';

export const UploadsSection = lazy(() =>
  import('./UploadsSection.js').then((m) => ({
    default: m.UploadsSection,
  }))
);
export type { UploadsSectionProps } from './UploadsSection.js';

// Preloaded while the editor is idle (usePreloadTools), so the first open is instant.
export const ToolsSection = lazyWithPreload(() =>
  import('./tools/index.js').then((m) => m.ToolsSection)
);
export type { ToolsSectionProps } from './tools/index.js';
