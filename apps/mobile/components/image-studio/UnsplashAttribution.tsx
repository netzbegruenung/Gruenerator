import { Pressable, Text, StyleSheet, View, Linking } from 'react-native';

import { spacing, typography } from '../../theme';

import type { StockImageAttribution } from '@gruenerator/shared/image-studio';

interface UnsplashAttributionProps {
  attribution: StockImageAttribution;
  compact?: boolean;
}

export function UnsplashAttribution({ attribution, compact = false }: UnsplashAttributionProps) {
  const handlePress = () => {
    if (attribution.profileUrl) {
      Linking.openURL(attribution.profileUrl);
    }
  };

  if (compact) {
    return (
      <Pressable onPress={handlePress} style={styles.compactContainer}>
        <Text style={styles.compactText} numberOfLines={1}>
          {attribution.photographer}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handlePress} style={styles.container}>
      <Text style={styles.text}>
        Foto von <Text style={styles.bold}>{attribution.photographer}</Text> auf Unsplash
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: spacing.xxsmall,
    paddingHorizontal: spacing.xsmall,
  },
  text: {
    ...typography.caption,
    color: '#ffffff',
    textAlign: 'center',
  },
  bold: {
    fontWeight: '700',
  },
  compactContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 2,
    paddingHorizontal: spacing.xxsmall,
  },
  compactText: {
    fontSize: 9,
    color: '#ffffff',
    textAlign: 'center',
  },
});
