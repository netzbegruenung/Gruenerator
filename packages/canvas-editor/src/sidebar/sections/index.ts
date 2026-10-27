/**
 * Sidebar Sections Index
 *
 * Exports are split into static and lazy-loaded sections:
 * - Lightweight sections are exported directly
 * - Heavy sections are lazy-loaded with React.lazy() to reduce initial bundle size
 */

import { lazy } from 'react';

import { lazyWithPreload } from '@ggraphic/editor/sidebar/sections/lazyWithPreload';

// =============================================================================
// STATIC EXPORTS - Lightweight sections loaded immediately
// =============================================================================

export { CombinedTextSection } from '@ggraphic/editor/sidebar/sections/CombinedTextSection';
export type { CombinedTextSectionProps } from '@ggraphic/editor/sidebar/sections/CombinedTextSection';
export { ChatSection } from './ChatSection';
export type { ChatSectionProps } from './ChatSection';
// Static: IconsSection used to be statically imported by AssetsSection, so the
// previous lazy() wrapper was an ineffective dynamic import
// (it confused the chunker). Export it directly.
export { IconsSection } from '@ggraphic/editor/sidebar/sections/IconsSection';
export { BadgeSection } from './BadgeSection';
export type { BadgeSectionProps } from './BadgeSection';
export { BalkenSettingsSection } from './BalkenSettingsSection';
export type { BalkenSettingsSectionProps } from './BalkenSettingsSection';
export { FrameSettingsSection } from './FrameSettingsSection';
export type { FrameSettingsSectionProps } from './FrameSettingsSection';
export { FormenSection } from '@ggraphic/editor/sidebar/sections/FormenSection';
export type { FormenSectionProps } from '@ggraphic/editor/sidebar/sections/FormenSection';
export * from './dreizeilen';

// =============================================================================
// LAZY EXPORTS - Heavy sections loaded on-demand
// =============================================================================

// Preloaded while the editor is idle (usePreloadElements), so the first open is instant.
export const AssetsSection = lazyWithPreload(() => import('./assets').then((m) => m.AssetsSection));

export const GenericShareSection = lazy(() =>
  import('@ggraphic/editor/sidebar/sections/GenericShareSection').then((m) => ({
    default: m.GenericShareSection,
  }))
);
export type { GenericShareSectionProps } from '@ggraphic/editor/sidebar/sections/GenericShareSection';

export const UploadsSection = lazy(() =>
  import('./UploadsSection').then((m) => ({ default: m.UploadsSection }))
);
export type { UploadsSectionProps } from './UploadsSection';

// Preloaded while the editor is idle (usePreloadTools), so the first open is instant.
export const ToolsSection = lazyWithPreload(() => import('./tools').then((m) => m.ToolsSection));
export type { ToolsSectionProps } from './tools';
