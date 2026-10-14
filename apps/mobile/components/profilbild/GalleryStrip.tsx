import {
  type StudioAssetItem,
  type StudioAssetKind,
  type StudioAssetScope,
} from '@gruenerator/contracts';
import { useStudioAssets } from '@gruenerator/shared/studio-assets';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { resolveChatUrl } from '../../services/chatApiUrl';
import { secureStorage } from '../../services/storage';
import { borderRadius, spacing, typography } from '../../theme';
import { Button } from '../common/Button';

import { galleryEmptyText, galleryErrorText, galleryTilePath } from './galleryModel';

const TILE = 64;

interface GalleryStripProps {
  kind: StudioAssetKind;
  scope: StudioAssetScope;
  /** The src of the item in use, marked selected; null when the tiles only add. */
  selectedSrc: string | null;
  onPick(item: StudioAssetItem): void;
}

/** One gallery list (Entdecken, Meine or Gemerkt) as a horizontal row of picker tiles. */
export function GalleryStrip({ kind, scope, selectedSrc, onPick }: GalleryStripProps) {
  const theme = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const { items, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useStudioAssets({ kind, scope, q: '', sort: 'new' });

  useEffect(() => {
    let alive = true;
    void secureStorage.getToken().then((t) => {
      if (alive) setToken(t);
    });
    return () => {
      alive = false;
    };
  }, []);

  const hint = [styles.hint, { color: theme.textSecondary }];
  if (isLoading) return <ActivityIndicator color={theme.textGreen} style={styles.loading} />;
  if (isError && items.length === 0)
    return (
      <View accessibilityRole="alert" style={styles.message}>
        <Text style={hint}>{galleryErrorText(kind)}</Text>
        <Button variant="outline" onPress={() => void refetch()}>
          Erneut versuchen
        </Button>
      </View>
    );
  if (items.length === 0) return <Text style={hint}>{galleryEmptyText(kind, scope)}</Text>;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((item) => {
        const isSelected = selectedSrc !== null && selectedSrc === item.src;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={
              kind === 'sticker' ? `Sticker „${item.title}“ hinzufügen` : item.title
            }
            accessibilityState={selectedSrc === null ? {} : { selected: isSelected }}
            onPress={() => onPick(item)}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor: pressed ? theme.buttonBackground : theme.surface,
                borderColor: isSelected ? theme.textGreen : 'transparent',
              },
            ]}
          >
            <Image
              source={{
                uri: resolveChatUrl(galleryTilePath(item)),
                ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
              }}
              contentFit={kind === 'sticker' ? 'contain' : 'cover'}
              style={kind === 'sticker' ? styles.sticker : styles.background}
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        );
      })}
      {hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mehr laden"
          disabled={isFetchingNextPage}
          onPress={() => void fetchNextPage()}
          style={[styles.tile, styles.more, { backgroundColor: theme.surface }]}
        >
          {isFetchingNextPage ? (
            <ActivityIndicator color={theme.textGreen} />
          ) : (
            <Text style={[styles.moreText, { color: theme.text }]}>Mehr</Text>
          )}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xsmall, paddingVertical: spacing.xxsmall },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: borderRadius.large,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sticker: { width: TILE - spacing.small, height: TILE - spacing.small },
  background: { width: '100%', height: '100%' },
  more: { borderColor: 'transparent' },
  moreText: { ...typography.caption },
  hint: { ...typography.caption },
  message: { gap: spacing.xsmall, alignItems: 'flex-start' },
  loading: { alignSelf: 'flex-start', paddingVertical: spacing.small },
});
