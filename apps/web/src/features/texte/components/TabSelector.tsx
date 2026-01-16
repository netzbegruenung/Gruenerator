import { useMemo, useCallback, memo } from 'react';
import { type TabId, TAB_CONFIGS } from '../types';
import Icon from '../../../components/common/Icon';
import './TabSelector.css';

interface TabSelectorProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  disabled?: boolean;
}

const TAB_ICONS: Record<TabId, { category: string; name: string }> = {
  'texte': { category: 'navigation', name: 'texte' },
  'presse-social': { category: 'platforms', name: 'pressemitteilung' },
  'antrag': { category: 'textTypes', name: 'antrag' },
  'universal': { category: 'textTypes', name: 'universal' },
  'barrierefreiheit': { category: 'navigation', name: 'barrierefreiheit' },
  'texteditor': { category: 'actions', name: 'edit' },
  'eigene': { category: 'navigation', name: 'eigene' }
};

const TabSelector: React.FC<TabSelectorProps> = memo(({
  activeTab,
  onTabChange,
  disabled = false
}) => {
  const tabs = useMemo(() =>
    TAB_CONFIGS.map(config => ({
      id: config.id,
      label: config.label,
      shortLabel: config.shortLabel,
      icon: TAB_ICONS[config.id]
    })),
    []
  );

  const handleTabClick = useCallback((tabId: TabId) => {
    if (!disabled && tabId !== activeTab) {
      onTabChange(tabId);
    }
  }, [disabled, activeTab, onTabChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, tabId: TabId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleTabClick(tabId);
    }
  }, [handleTabClick]);

  return (
    <div
      className={`texte-tab-selector ${disabled ? 'disabled' : ''}`}
      role="tablist"
      aria-label="Text-Generator auswählen"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            className={`texte-tab-button ${isActive ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
            disabled={disabled}
            tabIndex={isActive ? 0 : -1}
          >
            <Icon
              category={tab.icon.category as any}
              name={tab.icon.name}
              size={18}
              className="texte-tab-icon"
            />
            <span className="texte-tab-label">{tab.label}</span>
            <span className="texte-tab-label-short">{tab.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
});

TabSelector.displayName = 'TabSelector';

export default TabSelector;
