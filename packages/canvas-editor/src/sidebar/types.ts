import type { AdditionalText } from '../configs/types';
import type { SidebarTab, SidebarTabId } from '@ggraphic/editor/sidebar/tabTypes';

export type {
  BackgroundColorOption,
  CoreSidebarTabId,
  SidebarTab,
  SidebarTabId,
} from '@ggraphic/editor/sidebar/tabTypes';

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

export type { StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';

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
