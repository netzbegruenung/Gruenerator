/**
 * Example usage of the TabbedLayout component.
 * This file demonstrates how to create a simple tabbed interface.
 *
 * Delete this file when no longer needed for reference.
 */

import React from 'react';

import Icon from '../Icon';

import { TabbedLayout, useTabManager, type TabConfig } from './index';

// Define your tab IDs as a union type for type safety
type SettingsTabId = 'profile' | 'notifications' | 'security';

// Define tab configurations
const SETTINGS_TABS: TabConfig<SettingsTabId>[] = [
  {
    id: 'profile',
    label: 'Profil',
    shortLabel: 'Profil',
    icon: <Icon category="navigation" name="profil" size={18} />,
  },
  {
    id: 'notifications',
    label: 'Benachrichtigungen',
    shortLabel: 'Benachr.',
    icon: <Icon category="ui" name="bell" size={18} />,
  },
  {
    id: 'security',
    label: 'Sicherheit',
    shortLabel: 'Sicher.',
    icon: <Icon category="actions" name="lock" size={18} />,
  },
];

const VALID_TABS = ['profile', 'notifications', 'security'] as const;

/**
 * Example: Simple settings page with tabbed navigation
 */
export const SettingsPageExample: React.FC = () => {
  // Use the generic tab manager hook with URL persistence
  const { activeTab, setActiveTab } = useTabManager<SettingsTabId>({
    defaultTab: 'profile',
    validTabs: VALID_TABS,
    urlParam: 'section', // ?section=notifications
    storageKey: 'settings-tab',
  });

  return (
    <TabbedLayout
      tabs={SETTINGS_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      ariaLabel="Einstellungen Navigation"
      header={<h1 style={{ margin: '0 0 1rem 0' }}>Einstellungen</h1>}
    >
      {{
        profile: (
          <div>
            <h2>Profil Einstellungen</h2>
            <p>Hier können Sie Ihr Profil bearbeiten.</p>
          </div>
        ),
        notifications: (
          <div>
            <h2>Benachrichtigungen</h2>
            <p>Verwalten Sie Ihre Benachrichtigungseinstellungen.</p>
          </div>
        ),
        security: (
          <div>
            <h2>Sicherheit</h2>
            <p>Passwort und Zwei-Faktor-Authentifizierung.</p>
          </div>
        ),
      }}
    </TabbedLayout>
  );
};

/**
 * Example: Minimal usage without persistence
 */
export const MinimalExample: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<'tab1' | 'tab2'>('tab1');

  return (
    <TabbedLayout
      tabs={[
        { id: 'tab1', label: 'Tab 1' },
        { id: 'tab2', label: 'Tab 2' },
      ]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {{
        tab1: <div>Content for Tab 1</div>,
        tab2: <div>Content for Tab 2</div>,
      }}
    </TabbedLayout>
  );
};

export default SettingsPageExample;
