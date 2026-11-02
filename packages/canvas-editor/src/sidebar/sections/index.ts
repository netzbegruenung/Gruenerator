/**
 * Sidebar Sections Index
 *
 * The core's sections (and their lazy wrappers) come from
 * `@ggraphic/editor/sidebar/sections/index`; this barrel adds the
 * Grünerator's own: chat, badge, Balken and the Dreizeiler sections.
 */

export {
  CombinedTextSection,
  FrameSettingsSection,
  AssetsSection,
  UploadsSection,
  ToolsSection,
} from '@ggraphic/editor/sidebar';
export {
  type CombinedTextSectionProps,
  IconsSection,
  type FrameSettingsSectionProps,
  ShapesSection,
  type ShapesSectionProps,
  FormenSection,
  type FormenSectionProps,
  GenericShareSection,
  type GenericShareSectionProps,
  type UploadsSectionProps,
  type ToolsSectionProps,
} from '@ggraphic/editor/internal/sidebar/sections/index';

export { ChatSection } from './ChatSection';
export type { ChatSectionProps } from './ChatSection';
export { BadgeSection } from './BadgeSection';
export type { BadgeSectionProps } from './BadgeSection';
export { BalkenSettingsSection } from './BalkenSettingsSection';
export type { BalkenSettingsSectionProps } from './BalkenSettingsSection';
export * from './dreizeilen';
