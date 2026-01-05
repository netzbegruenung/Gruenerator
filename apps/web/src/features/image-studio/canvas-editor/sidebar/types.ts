import type { IconType } from 'react-icons';

export type SidebarTabId = 'text' | 'fontsize' | 'background' | 'assets' | 'alternatives' | 'image' | 'gradient' | 'position';

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

export interface AssetItem {
  id: string;
  src: string;
  label: string;
  visible: boolean;
}

export interface TextSectionProps {
  quote: string;
  name: string;
  onQuoteChange: (quote: string) => void;
  onNameChange: (name: string) => void;
}

export interface FontSizeSectionProps {
  quoteFontSize?: number;
  nameFontSize?: number;
  onQuoteFontSizeChange?: (size: number) => void;
  onNameFontSizeChange?: (size: number) => void;
}

export interface BackgroundSectionProps {
  colors: BackgroundColorOption[];
  currentColor: string;
  onColorChange: (color: string) => void;
}

export interface AssetsSectionProps {
  assets: AssetItem[];
  onAssetToggle: (assetId: string, visible: boolean) => void;
}

export interface AlternativesSectionProps {
  alternatives: string[];
  currentQuote: string;
  onAlternativeSelect: (alternative: string) => void;
}

export interface ImageSectionProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  onReset: () => void;
}

export interface GradientSectionProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
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

export interface CanvasSidebarProps {
  quote: string;
  name: string;
  onQuoteChange: (quote: string) => void;
  onNameChange: (name: string) => void;
  backgroundColor: string;
  backgroundColors: BackgroundColorOption[];
  onBackgroundChange: (color: string) => void;
  assets: AssetItem[];
  onAssetToggle: (assetId: string, visible: boolean) => void;
  alternatives: string[];
  onAlternativeSelect: (alternative: string) => void;
  quoteFontSize?: number;
  nameFontSize?: number;
  onQuoteFontSizeChange?: (size: number) => void;
  onNameFontSizeChange?: (size: number) => void;
  onExport?: () => void;
  onSave?: () => void;
}
