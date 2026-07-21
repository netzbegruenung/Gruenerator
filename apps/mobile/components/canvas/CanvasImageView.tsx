import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';

import { darkTheme, lightTheme } from '../../theme';

/**
 * Read-only canvas (sharepic) view: the server-rendered thumbnail image, pinch/
 * double-tap zoomable. Native rebuild of the react-konva editor isn't feasible,
 * so image-only is the display-only surface (download lives in the top bar).
 * Multi-page canvases only have a first-page thumbnail server-side (v1 limit).
 */
export function CanvasImageView({
  thumbnailUrl,
  pageCount,
}: {
  thumbnailUrl?: string | null;
  pageCount?: number;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { width, height } = useWindowDimensions();

  if (!thumbnailUrl) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.background }]}>
        <Ionicons name="image-outline" size={56} color={theme.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Vorschau</Text>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Für dieses Sharepic gibt es noch keine Vorschau. Öffne es einmal im Browser, um eine zu
          erzeugen.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.center}
      maximumZoomScale={4}
      minimumZoomScale={1}
      centerContent
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
    >
      <Image
        source={{ uri: thumbnailUrl }}
        style={{ width, height: height * 0.8 }}
        contentFit="contain"
        transition={150}
      />
      {typeof pageCount === 'number' && pageCount > 1 && (
        <View
          style={[styles.pageBadge, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Text style={[styles.pageBadgeText, { color: theme.textSecondary }]}>
            Seite 1 von {pageCount}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  pageBadge: {
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pageBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
