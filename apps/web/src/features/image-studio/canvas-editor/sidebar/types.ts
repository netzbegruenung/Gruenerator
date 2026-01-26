import type { IconType } from 'react-icons';

/**
 * All possible sidebar tab IDs.
 *
 * Unified tabs (used in heterogeneous multi-page):
 * - 'background': Hintergrund (image or color based on template)
 * - 'text': Text editing section
 * - 'elements': Decorative elements (icons, shapes, illustrations)
 * - 'alternatives': AI-generated alternatives
 * - 'share': Export and sharing options
 *
 * Legacy tabs (template-specific, being migrated):
 * - 'image-background': Image background section (→ 'background')
 * - 'image': Image controls (→ 'background')
 * - 'assets': Elements section (→ 'elements')
 * - 'position': Dreizeilen-specific balken controls
 * - 'fontsize': Deprecated - merged into 'text'
 */
export type SidebarTabId =
  // Unified tab IDs (used in heterogeneous multi-page mode)
  | 'background'
  | 'text'
  | 'elements'
  | 'alternatives'
  | 'share'
  // Legacy/template-specific tab IDs (for backwards compatibility)
  | 'fontsize'
  | 'assets'
  | 'image'
  | 'position'
  | 'image-background';

export interface SidebarTab {
  id: SidebarTabId;
  icon: IconType;
  label: string;
  ariaLabel: string;
}

export interface BackgroundColorOption {
  id: string;
  label: string;
  color: string;
}

export interface TextSectionProps {
  quote: string;
  name: string;
  onQuoteChange: (quote: string) => void;
  onNameChange: (name: string) => void;
  onAddHeader?: () => void;
  onAddText?: () => void;
  additionalTexts?: AdditionalText[];
  onUpdateAdditionalText?: (id: string, text: string) => void;
  onRemoveAdditionalText?: (id: string) => void;
  // Font Size Props
  quoteFontSize?: number;
  nameFontSize?: number;
  onQuoteFontSizeChange?: (size: number) => void;
  onNameFontSizeChange?: (size: number) => void;
  onUpdateAdditionalTextFontSize?: (id: string, size: number) => void;
  // Alternatives Props
  alternatives?: string[];
  onAlternativeSelect?: (alternative: string) => void;
}

export interface FontSizeSectionProps {
  quoteFontSize?: number;
  nameFontSize?: number;
  onQuoteFontSizeChange?: (size: number) => void;
  onNameFontSizeChange?: (size: number) => void;
}

export interface BackgroundSectionProps {
  // Color props
  colors: BackgroundColorOption[];
  currentColor: string;
  onColorChange: (color: string) => void;
  gradientOpacity?: number;
  onGradientOpacityChange?: (opacity: number) => void;

  // Image props (optional - enables image subsection)
  currentImageSrc?: string;
  onImageChange?: (
    file: File | null,
    objectUrl?: string,
    attribution?: StockImageAttribution | null
  ) => void;

  // Context for AI suggestions (optional)
  textContext?: string;
}

// Stock image attribution interface (imported from image service)
export interface StockImageAttribution {
  photographer: string;
  profileUrl: string;
  photoUrl: string;
  downloadLocation?: string;
}

export interface ImageSectionProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  onReset: () => void;
}

export interface GradientSectionProps {
  opacity: number;
  onOpacityChange: (opacity: number) => void;
}

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SidebarTabBarProps {
  tabs: SidebarTab[];
  activeTab: SidebarTabId | null;
  onTabClick: (tabId: SidebarTabId) => void;
  onExport?: () => void;
  // autoSaveStatus removed - SidebarTabBar now reads directly from useAutoSaveStore
  disabledTabs?: SidebarTabId[];
  horizontal?: boolean;
}

export interface SidebarPanelProps {
  isOpen: boolean;
  children: React.ReactNode;
  onClose?: () => void;
}

export interface AdditionalText {
  id: string;
  text: string;
  type: 'header' | 'body';
  x?: number;
  y?: number;
  width?: number;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
}
