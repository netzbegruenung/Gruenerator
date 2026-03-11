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
export { AlternativesSection } from './AlternativesSection';
export type { AlternativesSectionProps } from './AlternativesSection';
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
