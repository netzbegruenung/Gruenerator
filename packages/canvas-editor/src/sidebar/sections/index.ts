/**
 * Sidebar Sections Index
 *
 * Exports are split into static and lazy-loaded sections:
 * - Lightweight sections are exported directly (FontSizeSection, etc.)
 * - Heavy sections are lazy-loaded with React.lazy() to reduce initial bundle size
 */

import { lazy } from 'react';

// =============================================================================
// STATIC EXPORTS - Lightweight sections loaded immediately
// =============================================================================

export { FontSizeSection } from './FontSizeSection';
export { FreeformTextSection } from './FreeformTextSection';
export type { FreeformTextSectionProps } from './FreeformTextSection';
export { UnifiedTextSection } from './UnifiedTextSection';
export type { UnifiedTextSectionProps } from './UnifiedTextSection';
export { CombinedTextSection } from './CombinedTextSection';
export type { CombinedTextSectionProps } from './CombinedTextSection';
export { AiSection, SuggestionCard, OperationPreview } from './AiSection';
export type { AiSectionProps, SuggestionCardProps } from './AiSection';
export { ChatSection } from './ChatSection';
export type { ChatSectionProps } from './ChatSection';
export const IconsSection = lazy(() =>
  import('./IconsSection').then((m) => ({ default: m.IconsSection }))
);
export { BadgeSection } from './BadgeSection';
export type { BadgeSectionProps } from './BadgeSection';
export { BalkenSection } from './BalkenSection';
export type { BalkenSectionProps } from './BalkenSection';
export { BalkenSettingsSection } from './BalkenSettingsSection';
export type { BalkenSettingsSectionProps } from './BalkenSettingsSection';
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

export const PresentationDesignSection = lazy(() =>
  import('./PresentationDesignSection').then((m) => ({ default: m.PresentationDesignSection }))
);
export type { PresentationDesignSectionProps } from './PresentationDesignSection';

export const UploadsSection = lazy(() =>
  import('./UploadsSection').then((m) => ({ default: m.UploadsSection }))
);
export type { UploadsSectionProps } from './UploadsSection';

export const ToolsSection = lazy(() =>
  import('./tools').then((m) => ({ default: m.ToolsSection }))
);
export type { ToolsSectionProps } from './tools';
