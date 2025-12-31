/**
 * StylePreview Component
 * Visual preview of subtitle style for option grid
 */

import { View, Text, StyleSheet } from 'react-native';
import { SUBTITLE_STYLE_CONFIGS } from '@gruenerator/shared/subtitle-editor';
import type { SubtitleStylePreference } from '@gruenerator/shared/subtitle-editor';

interface StylePreviewProps {
  style: SubtitleStylePreference;
}

export function StylePreview({ style }: StylePreviewProps) {
  const config = SUBTITLE_STYLE_CONFIGS[style];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          paddingHorizontal: config.padding !== '0' ? 6 : 0,
          paddingVertical: config.padding !== '0' ? 2 : 0,
          borderRadius: config.borderRadius !== '0' ? 2 : 0,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: config.textColor,
            textShadowColor: config.textShadow ? 'rgba(0,0,0,0.5)' : 'transparent',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: config.textShadow ? 2 : 0,
          },
        ]}
      >
        Abc
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  text: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});
