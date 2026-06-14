import { Image } from 'expo-image';
import { View, Text, StyleSheet } from 'react-native';

import { spacing, borderRadius } from '../../../theme';

import type { Theme } from '../../../theme/colors';
import type { ImageResultVM } from '@gruenerator/chat';

// Native renderer for the 'image' view kind (generate_image tool calls).
// The metadata-driven GeneratedImageDisplay stays the canonical path with
// zoom + save-to-gallery; this is the inline tool-call rendering.
export function ImageResultCard({ vm, theme }: { vm: ImageResultVM; theme: Theme }) {
  return (
    <View style={styles.wrap}>
      <Image
        source={{ uri: vm.url }}
        style={[styles.image, { backgroundColor: theme.surface, borderColor: theme.border }]}
        contentFit="cover"
        accessibilityLabel={vm.alt ?? 'Generiertes Bild'}
      />
      {vm.prompt ? (
        <Text style={[styles.caption, { color: theme.textSecondary }]} numberOfLines={2}>
          {vm.prompt}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xsmall,
    gap: spacing.xxsmall,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  caption: {
    fontSize: 12,
  },
});
