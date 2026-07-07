/**
 * Sidebar Sections Index
 *
 * Exports are split into static and lazy-loaded sections:
 * - Lightweight sections are exported directly
 * - Heavy sections are lazy-loaded with React.lazy() to reduce initial bundle size
 */

import { lazy } from 'react';

// =============================================================================
// STATIC EXPORTS - Lightweight sections loaded immediately
// =============================================================================

export { CombinedTextSection } from './CombinedTextSection';
export type { CombinedTextSectionProps } from './CombinedTextSection';
export { AiSection, SuggestionCard, OperationPreview } from './AiSection';
export type { AiSectionProps, SuggestionCardProps } from './AiSection';
export { ChatSection } from './ChatSection';
export type { ChatSectionProps } from './ChatSection';
// Static: IconsSection is already statically imported/rendered by AssetsSection
// + BrowseView, so the previous lazy() wrapper was an ineffective dynamic import
// (it confused the chunker). Export it directly.
export { IconsSection } from './IconsSection';
export { BadgeSection } from './BadgeSection';
export type { BadgeSectionProps } from './BadgeSection';
export { BalkenSettingsSection } from './BalkenSettingsSection';
export type { BalkenSettingsSectionProps } from './BalkenSettingsSection';
export { FrameSettingsSection } from './FrameSettingsSection';
export type { FrameSettingsSectionProps } from './FrameSettingsSection';
export { FormenSection } from './FormenSection';
export type { FormenSectionProps } from './FormenSection';
export * from './dreizeilen';

// =============================================================================
// LAZY EXPORTS - Heavy sections loaded on-demand
// =============================================================================

export const AssetsSection = lazy(() =>
  import('./assets').then((m) => ({ default: m.AssetsSection }))
);

export const BackgroundSection = lazy(() =>
  import('./BackgroundSection').then((m) => ({ default: m.BackgroundSection }))
);

export const ImageBackgroundSection = lazy(() =>
  import('./ImageBackgroundSection').then((m) => ({ default: m.ImageBackgroundSection }))
);

export const GenericShareSection = lazy(() =>
  import('./GenericShareSection').then((m) => ({ default: m.GenericShareSection }))
);
export type { GenericShareSectionProps } from './GenericShareSection';

export const UploadsSection = lazy(() =>
  import('./UploadsSection').then((m) => ({ default: m.UploadsSection }))
);
export type { UploadsSectionProps } from './UploadsSection';

export const ToolsSection = lazy(() =>
  import('./tools').then((m) => ({ default: m.ToolsSection }))
);
export type { ToolsSectionProps } from './tools';
