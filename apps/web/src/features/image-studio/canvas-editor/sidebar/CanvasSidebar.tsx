import { useState, useCallback, useEffect, useMemo } from 'react';
import { FaFont, FaTextHeight, FaImage, FaQuoteLeft } from 'react-icons/fa';
import { SidebarTabBar } from './SidebarTabBar';
import { SidebarPanel } from './SidebarPanel';
import { TextSection, FontSizeSection, BackgroundSection, AssetsSection, AlternativesSection } from './sections';
import type { CanvasSidebarProps, SidebarTab, SidebarTabId } from './types';
import './CanvasSidebar.css';

const SunflowerIcon = () => (
  <img src="/sonnenblume_dunkelgruen.svg" alt="" style={{ width: 24, height: 24 }} />
);

const ALL_TABS: SidebarTab[] = [
  { id: 'text', icon: FaFont, label: 'Text', ariaLabel: 'Text bearbeiten' },
  { id: 'fontsize', icon: FaTextHeight, label: 'Schriftgröße', ariaLabel: 'Schriftgröße anpassen' },
  { id: 'background', icon: FaImage, label: 'Farben', ariaLabel: 'Farben ändern' },
  { id: 'assets', icon: SunflowerIcon, label: 'Grafiken', ariaLabel: 'Grafiken verwalten' },
  { id: 'alternatives', icon: FaQuoteLeft, label: 'Alternativen', ariaLabel: 'Alternative Zitate' },
];

interface CanvasSidebarReturn {
  tabBar: React.ReactNode;
  panel: React.ReactNode;
}

export function useCanvasSidebar({
  quote,
  name,
  onQuoteChange,
  onNameChange,
  backgroundColor,
  backgroundColors,
  onBackgroundChange,
  assets,
  onAssetToggle,
  recommendedAssetIds,
  alternatives,
  onAlternativeSelect,
  quoteFontSize,
  nameFontSize,
  onQuoteFontSizeChange,
  onNameFontSizeChange,
  onExport,
  onSave,
  onAddHeader,
  onAddText,
  additionalTexts,
  onUpdateAdditionalText,
  onRemoveAdditionalText,
  onUpdateAdditionalTextFontSize,
}: CanvasSidebarProps): CanvasSidebarReturn {
  const [activeTab, setActiveTab] = useState<SidebarTabId | null>(null);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 900
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleTabClick = useCallback((tabId: SidebarTabId) => {
    setActiveTab((current) => {
      const newValue = current === tabId ? null : tabId;
      return newValue;
    });
  }, [activeTab]);

  const handleClose = useCallback(() => {
    setActiveTab(null);
  }, [activeTab]);

  // On desktop, hide fontsize tab (merged into text)
  const visibleTabs = useMemo(() =>
    isDesktop ? ALL_TABS.filter(t => t.id !== 'fontsize') : ALL_TABS,
    [isDesktop]
  );

  const disabledTabs: SidebarTabId[] = alternatives.length === 0 ? ['alternatives'] : [];

  const renderSectionContent = () => {
    switch (activeTab) {
      case 'text':
        return (
          <TextSection
            quote={quote}
            name={name}
            onQuoteChange={onQuoteChange}
            onNameChange={onNameChange}
            onAddHeader={onAddHeader}
            onAddText={onAddText}
            additionalTexts={additionalTexts}
            onUpdateAdditionalText={onUpdateAdditionalText}
            onRemoveAdditionalText={onRemoveAdditionalText}
            quoteFontSize={quoteFontSize}
            nameFontSize={nameFontSize}
            onQuoteFontSizeChange={onQuoteFontSizeChange}
            onNameFontSizeChange={onNameFontSizeChange}
            onUpdateAdditionalTextFontSize={onUpdateAdditionalTextFontSize}
          />
        );
      case 'fontsize':
        return (
          <FontSizeSection
            quoteFontSize={quoteFontSize}
            nameFontSize={nameFontSize}
            onQuoteFontSizeChange={onQuoteFontSizeChange}
            onNameFontSizeChange={onNameFontSizeChange}
          />
        );
      case 'background':
        return (
          <BackgroundSection
            colors={backgroundColors}
            currentColor={backgroundColor}
            onColorChange={onBackgroundChange}
          />
        );
      case 'assets':
        return (
          <AssetsSection
            assets={assets}
            onAssetToggle={onAssetToggle}
            recommendedAssetIds={recommendedAssetIds}
          />
        );
      case 'alternatives':
        return (
          <AlternativesSection
            alternatives={alternatives}
            currentQuote={quote}
            onAlternativeSelect={onAlternativeSelect}
          />
        );
      default:
        return null;
    }
  };

  return {
    tabBar: (
      <SidebarTabBar
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabClick={handleTabClick}
        onExport={onExport}
        onSave={onSave}

        disabledTabs={disabledTabs}
      />
    ),
    panel: (
      <SidebarPanel isOpen={activeTab !== null} onClose={handleClose}>
        {renderSectionContent()}
      </SidebarPanel>
    ),
  };
}

// Keep the old component for backwards compatibility
export function CanvasSidebar(props: CanvasSidebarProps) {
  const { tabBar, panel } = useCanvasSidebar(props);
  return (
    <div className="canvas-sidebar">
      {tabBar}
      {panel}
    </div>
  );
}
