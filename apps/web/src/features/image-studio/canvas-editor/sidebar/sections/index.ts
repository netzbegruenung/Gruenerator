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
export { UnifiedTextSection } from './UnifiedTextSection';
export type { UnifiedTextSectionProps } from './UnifiedTextSection';
export { AlternativesSection } from './AlternativesSection';
export type { AlternativesSectionProps } from './AlternativesSection';
export { IconsSection } from './IconsSection';
export { BalkenSection } from './BalkenSection';
export type { BalkenSectionProps } from './BalkenSection';
export { FormenSection } from './FormenSection';
export type { FormenSectionProps } from './FormenSection';
export * from './dreizeilen';

// =============================================================================
// LAZY EXPORTS - Heavy sections loaded on-demand
// =============================================================================

export const AssetsSection = lazy(() =>
  import('./AssetsSection').then((m) => ({ default: m.AssetsSection }))
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
