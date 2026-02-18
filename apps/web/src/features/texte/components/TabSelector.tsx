import { useMemo, useCallback, useRef, memo } from 'react';

import Icon from '../../../components/common/Icon';
import '../../../components/common/TabbedLayout/TabbedLayout.css';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { type TabId, type UniversalSubType, TAB_CONFIGS } from '../types';
import './TabSelector.css';

// Tabs that don't require authentication
const PUBLIC_TABS: TabId[] = ['presse-social'];

interface TabSelectorProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onUniversalSubTypeChange?: (subType: UniversalSubType) => void;
  selectedUniversalSubType?: UniversalSubType;
  disabled?: boolean;
  isAuthenticated?: boolean;
}

const TAB_ICONS: Record<TabId, { category: string; name: string }> = {
  texte: { category: 'navigation', name: 'texte' },
  'presse-social': { category: 'platforms', name: 'pressemitteilung' },
  antrag: { category: 'textTypes', name: 'antrag' },
  universal: { category: 'textTypes', name: 'universal' },
  barrierefreiheit: { category: 'navigation', name: 'barrierefreiheit' },
  texteditor: { category: 'actions', name: 'edit' },
  eigene: { category: 'navigation', name: 'eigene' },
};

const UNIVERSAL_OPTIONS: {
  value: UniversalSubType;
  label: string;
  icon: { category: string; name: string };
}[] = [
  { value: 'rede', label: 'Rede', icon: { category: 'textTypes', name: 'rede' } },
  {
    value: 'wahlprogramm',
    label: 'Wahlprogramm',
    icon: { category: 'textTypes', name: 'wahlprogramm' },
  },
  {
    value: 'buergeranfragen',
    label: 'Bürger*innenanfragen',
    icon: { category: 'textTypes', name: 'buergeranfragen' },
  },
  {
    value: 'leichte_sprache',
    label: 'Leichte Sprache',
    icon: { category: 'accessibility', name: 'leichteSprache' },
  },
];

const TabSelector: React.FC<TabSelectorProps> = memo(
  ({
    activeTab,
    onTabChange,
    onUniversalSubTypeChange,
    selectedUniversalSubType,
    disabled = false,
    isAuthenticated = false,
  }) => {
    const tabs = useMemo(
      () =>
        TAB_CONFIGS.filter((config) => config.id !== 'universal').map((config) => ({
          id: config.id,
          label: config.label,
          shortLabel: config.shortLabel,
          icon: TAB_ICONS[config.id],
        })),
      []
    );

    const universalTabConfig = useMemo(
      () => TAB_CONFIGS.find((config) => config.id === 'universal'),
      []
    );

    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    const navigableTabIds = useMemo(() => {
      const regularIds = TAB_CONFIGS.filter((config) => config.id !== 'universal').map(
        (config) => config.id
      );
      return [...regularIds, 'universal' as TabId];
    }, []);

    const handleTabClick = useCallback(
      (tabId: TabId) => {
        if (!disabled && tabId !== activeTab) {
          onTabChange(tabId);
        }
      },
      [disabled, activeTab, onTabChange]
    );

    const handleTabListKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (disabled) return;
        const target = event.target as HTMLElement;
        if (target.getAttribute('role') !== 'tab') return;

        const currentId = navigableTabIds.find((id) => tabRefs.current[id] === target);
        if (!currentId) return;
        const currentIndex = navigableTabIds.indexOf(currentId);

        let nextIndex: number | null = null;

        switch (event.key) {
          case 'ArrowRight':
            nextIndex = (currentIndex + 1) % navigableTabIds.length;
            break;
          case 'ArrowLeft':
            nextIndex = (currentIndex - 1 + navigableTabIds.length) % navigableTabIds.length;
            break;
          case 'Home':
            nextIndex = 0;
            break;
          case 'End':
            nextIndex = navigableTabIds.length - 1;
            break;
          default:
            return;
        }

        event.preventDefault();
        const nextId = navigableTabIds[nextIndex];
        tabRefs.current[nextId]?.focus();
        onTabChange(nextId);
      },
      [disabled, navigableTabIds, onTabChange]
    );

    const handleUniversalOptionSelect = useCallback(
      (subType: UniversalSubType) => {
        if (onUniversalSubTypeChange) {
          onUniversalSubTypeChange(subType);
        }
        onTabChange('universal');
      },
      [onUniversalSubTypeChange, onTabChange]
    );

    const isUniversalActive = activeTab === 'universal';

    return (
      <div
        className={`tabbed-layout__tabs ${disabled ? 'tabbed-layout__tabs--disabled' : ''}`}
        role="tablist"
        aria-label="Text-Generator auswählen"
        aria-orientation="horizontal"
        onKeyDown={handleTabListKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              className={`tabbed-layout__tab ${isActive ? 'tabbed-layout__tab--active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              disabled={disabled}
              tabIndex={isActive ? 0 : -1}
            >
              <Icon
                category={tab.icon.category as any}
                name={tab.icon.name}
                size={18}
                className="texte-tab-icon"
              />
              <span className="tabbed-layout__tab-label">{tab.label}</span>
              <span className="tabbed-layout__tab-label-short">{tab.shortLabel}</span>
              {!isAuthenticated && !PUBLIC_TABS.includes(tab.id) && (
                <Icon category="actions" name="lock" size={12} className="texte-tab-lock-icon" />
              )}
            </button>
          );
        })}

        {universalTabConfig && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                ref={(el) => {
                  tabRefs.current['universal'] = el;
                }}
                type="button"
                role="tab"
                id="tab-universal"
                aria-selected={isUniversalActive}
                aria-controls="tabpanel-universal"
                className={`tabbed-layout__tab has-dropdown ${isUniversalActive ? 'tabbed-layout__tab--active' : ''}`}
                disabled={disabled}
                tabIndex={isUniversalActive ? 0 : -1}
              >
                <Icon
                  category={TAB_ICONS['universal'].category as any}
                  name={TAB_ICONS['universal'].name}
                  size={18}
                  className="texte-tab-icon"
                />
                <span className="tabbed-layout__tab-label">{universalTabConfig.label}</span>
                <span className="tabbed-layout__tab-label-short">
                  {universalTabConfig.shortLabel}
                </span>
                {!isAuthenticated && (
                  <Icon category="actions" name="lock" size={12} className="texte-tab-lock-icon" />
                )}
                <Icon
                  category="ui"
                  name="caretDown"
                  size={14}
                  className="texte-tab-dropdown-icon"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {UNIVERSAL_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  className={`texte-tab-dropdown-item${selectedUniversalSubType === option.value ? ' texte-tab-dropdown-item--active' : ''}`}
                  onSelect={() => handleUniversalOptionSelect(option.value)}
                >
                  <Icon category={option.icon.category as any} name={option.icon.name} size={16} />
                  <span>{option.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }
);

TabSelector.displayName = 'TabSelector';

export default TabSelector;
