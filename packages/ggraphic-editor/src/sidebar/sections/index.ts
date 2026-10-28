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

import { lazyWithPreload } from './lazyWithPreload';

// =============================================================================
// STATIC EXPORTS - Lightweight sections loaded immediately
// =============================================================================

export { CombinedTextSection } from './CombinedTextSection';
export type { CombinedTextSectionProps } from './CombinedTextSection';
// Static: IconsSection used to be statically imported by AssetsSection, so the
// previous lazy() wrapper was an ineffective dynamic import
// (it confused the chunker). Export it directly.
export { IconsSection } from './IconsSection';
export { FrameSettingsSection } from './FrameSettingsSection';
export type { FrameSettingsSectionProps } from './FrameSettingsSection';
export { FormenSection } from './FormenSection';
export type { FormenSectionProps } from './FormenSection';

// =============================================================================
// LAZY EXPORTS - Heavy sections loaded on-demand
// =============================================================================

// Preloaded while the editor is idle (usePreloadElements), so the first open is instant.
export const AssetsSection = lazyWithPreload(() =>
  import('./assets/index').then((m) => m.AssetsSection)
);

export const GenericShareSection = lazy(() =>
  import('./GenericShareSection').then((m) => ({
    default: m.GenericShareSection,
  }))
);
export type { GenericShareSectionProps } from './GenericShareSection';

export const UploadsSection = lazy(() =>
  import('./UploadsSection').then((m) => ({
    default: m.UploadsSection,
  }))
);
export type { UploadsSectionProps } from './UploadsSection';

// Preloaded while the editor is idle (usePreloadTools), so the first open is instant.
export const ToolsSection = lazyWithPreload(() =>
  import('./tools/index').then((m) => m.ToolsSection)
);
export type { ToolsSectionProps } from './tools/index';
