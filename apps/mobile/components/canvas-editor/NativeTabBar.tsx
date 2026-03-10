import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCanvasEditorBridgeStore } from '../../stores/canvasEditorBridgeStore';

import type { SidebarTabId } from './types';

const TAB_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  background: 'image-outline',
  text: 'text-outline',
  elements: 'grid-outline',
  alternatives: 'sparkles-outline',
  share: 'share-outline',
  fontsize: 'text-outline',
  assets: 'shapes-outline',
  image: 'image-outline',
  position: 'move-outline',
  settings: 'settings-outline',
  'image-background': 'image-outline',
};

export function NativeTabBar() {
  const insets = useSafeAreaInsets();
  const tabs = useCanvasEditorBridgeStore((s) => s.tabs);
  const activeTab = useCanvasEditorBridgeStore((s) => s.activeTab);
  const setActiveTab = useCanvasEditorBridgeStore((s) => s.setActiveTab);

  const handlePress = useCallback(
    (tabId: SidebarTabId) => {
      // Toggle: press active tab to close panel, press inactive to switch
      setActiveTab(activeTab === tabId ? null : tabId);
    },
    [activeTab, setActiveTab]
  );

  if (tabs.length === 0) return null;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const iconName = TAB_ICON_MAP[tab.id] || 'ellipsis-horizontal-outline';

        return (
          <Pressable
            key={tab.id}
            style={[styles.tab, isActive && styles.tabActive, tab.disabled && styles.tabDisabled]}
            onPress={() => handlePress(tab.id)}
            disabled={tab.disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive, disabled: tab.disabled }}
            accessibilityLabel={tab.label}
          >
            <Ionicons
              name={iconName}
              size={22}
              color={isActive ? '#005538' : tab.disabled ? '#9CA3AF' : '#6B7280'}
            />
            <Text
              style={[
                styles.tabLabel,
                isActive && styles.tabLabelActive,
                tab.disabled && styles.tabLabelDisabled,
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
    minHeight: 64,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 2,
    minHeight: 48,
  },
  tabActive: {
    backgroundColor: '#E8F5EE',
  },
  tabDisabled: {
    opacity: 0.4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#005538',
  },
  tabLabelDisabled: {
    color: '#9CA3AF',
  },
});
