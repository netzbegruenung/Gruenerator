import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';

import { useCanvasEditorBridgeStore } from '../../stores/canvasEditorBridgeStore';

const SUBSECTION_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  text: 'text-outline',
  suche: 'search-outline',
  grafiken: 'extension-puzzle-outline',
  badges: 'pricetag-outline',
  formen: 'shapes-outline',
  rahmen: 'scan-outline',
  illustrationen: 'happy-outline',
  icons: 'sparkles-outline',
  color: 'color-palette-outline',
  unsplash: 'image-outline',
  'image-source': 'cloud-upload-outline',
  'unsplash-search': 'search-outline',
  'image-adjustments': 'options-outline',
  download: 'download-outline',
  template: 'save-outline',
  'instagram-text': 'text-outline',
  colors: 'color-palette-outline',
  width: 'resize-outline',
  finetune: 'options-outline',
};

export function NativeSubsectionBar() {
  const subsections = useCanvasEditorBridgeStore((s) => s.subsections);
  const activeSubsection = useCanvasEditorBridgeStore((s) => s.activeSubsection);
  const setActiveSubsection = useCanvasEditorBridgeStore((s) => s.setActiveSubsection);

  const handlePress = useCallback(
    (id: string) => {
      setActiveSubsection(id);
    },
    [setActiveSubsection]
  );

  if (subsections.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {subsections.map((sub) => {
          const isActive = activeSubsection === sub.id;
          const iconName = SUBSECTION_ICON_MAP[sub.id] || 'ellipsis-horizontal-outline';

          return (
            <Pressable
              key={sub.id}
              style={styles.item}
              onPress={() => handlePress(sub.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={sub.label}
            >
              <Ionicons name={iconName} size={20} color={isActive ? '#005538' : '#9CA3AF'} />
              <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                {sub.label}
              </Text>
              {isActive && <View style={styles.indicator} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  scrollContent: {
    paddingHorizontal: 8,
    gap: 4,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 48,
    height: 44,
    position: 'relative',
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 1,
  },
  labelActive: {
    color: '#005538',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#005538',
  },
});
