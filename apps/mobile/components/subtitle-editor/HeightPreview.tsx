/**
 * HeightPreview Component
 * Visual preview of subtitle position for option grid
 */

import { View, StyleSheet } from 'react-native';
import { colors, borderRadius } from '../../theme';
import type { SubtitleHeightPreference } from '@gruenerator/shared/subtitle-editor';

interface HeightPreviewProps {
  position: SubtitleHeightPreference;
}

export function HeightPreview({ position }: HeightPreviewProps) {
  return (
    <View style={styles.container}>
      <View
        style={[styles.subtitleBar, position === 'tief' ? styles.positionLow : styles.positionMid]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  subtitleBar: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    height: 4,
    backgroundColor: colors.white,
    borderRadius: 2,
  },
  positionLow: {
    bottom: 4,
  },
  positionMid: {
    bottom: 12,
  },
});
