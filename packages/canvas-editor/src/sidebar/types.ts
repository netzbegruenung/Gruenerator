import type { AdditionalText } from '../configs/types';
import type { IconType } from 'react-icons';

/**
 * All possible sidebar tab IDs.
 *
 * Unified tabs (used in heterogeneous multi-page):
 * - 'text': Text editing section
 * - 'elements': Decorative elements (icons, shapes, illustrations)
 * - 'share': Export and sharing options
 *
 * Legacy tabs (template-specific, being migrated):
 * - 'assets': Elements section (→ 'elements')
 * - 'position': Dreizeilen-specific balken controls
 * - 'fontsize': Deprecated - merged into 'text'
 */
export type SidebarTabId =
  // Unified tab IDs (used in heterogeneous multi-page mode)
  | 'text'
  | 'elements'
  | 'share'
  | 'uploads'
  | 'tools'
  | 'chat'
  // Editor-level: the whole document, not a page (components/CanvasEditor/vorlagenTab.ts)
  | 'vorlagen'
  // Legacy/template-specific tab IDs (for backwards compatibility)
  | 'fontsize'
  | 'assets'
  | 'position'
  | 'settings'
  | 'frame-settings'
  | 'chart-settings'
  | 'image-adjust'
  | 'design';

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
}

// Stock image attribution interface (imported from image service)
export interface StockImageAttribution {
  photographer: string;
  profileUrl: string;
  photoUrl: string;
  downloadLocation?: string;
  /** Without the `@`; credited in the post text when present. */
  instagramUsername?: string;
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
