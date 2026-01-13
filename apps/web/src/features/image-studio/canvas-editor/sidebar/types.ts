import type { IconType } from 'react-icons';

export type SidebarTabId = 'text' | 'fontsize' | 'background' | 'assets' | 'alternatives' | 'image' | 'position' | 'image-background' | 'share';

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
  onImageChange?: (file: File | null, objectUrl?: string, attribution?: StockImageAttribution | null) => void;

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

export interface SidebarTabBarProps {
  tabs: SidebarTab[];
  activeTab: SidebarTabId | null;
  onTabClick: (tabId: SidebarTabId) => void;
  onExport?: () => void;
  onSave?: () => void;
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
