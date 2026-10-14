import { type StudioAssetItem, type StudioAssetKind } from '@gruenerator/contracts';
import { isShareSrc } from '@gruenerator/shared/stickers';
import {
  useDiscoverStudioAssets,
  useOwnStudioAssets,
  type StudioAssetSectionData,
} from '@gruenerator/shared/studio-assets';
import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { resolveChatUrl } from '../../services/chatApiUrl';
import { borderRadius, spacing, typography } from '../../theme';
import { Button } from '../common/Button';
import { useShareToken } from '../studio-assets/useShareToken';

import { galleryErrorText, galleryTilePath } from './galleryModel';

export const PICKER_TILE = 64;

export interface GalleryTilesProps {
  kind: StudioAssetKind;
  /** `own`: created and saved; `shop`: what others share (Entdecken). */
  source: 'own' | 'shop';
  q?: string;
  /** The src of the item in use, marked selected; null when the tiles only add. */
  selectedSrc?: string | null;
  onPick(item: StudioAssetItem): void;
  /** Stands in the same row before the items — the own background photo. */
  leading?: ReactNode;
  /** The src of `leading`; when it is already an item, `leading` is left out instead of doubled. */
  leadingSrc?: string | null;
  /** Stands in the same row after the items — upload, create, Entdecken. */
  trailing?: ReactNode;
  emptyHint?: string;
}

/** Gallery items as picker tiles in one wrapping row (web: `ProfilbildGalleryGrid`). */
export function GalleryTiles(props: GalleryTilesProps) {
  return props.source === 'own' ? <OwnTiles {...props} /> : <ShopTiles {...props} />;
}

function OwnTiles(props: GalleryTilesProps) {
  const { data } = useOwnStudioAssets(props.kind, props.q ?? '');
  return <Tiles {...props} data={data} />;
}

function ShopTiles(props: GalleryTilesProps) {
  const { data } = useDiscoverStudioAssets(props.kind, props.q ?? '', 'new');
  return <Tiles {...props} data={data} />;
}

function Tiles({
  kind,
  selectedSrc = null,
  onPick,
  leading,
  leadingSrc = null,
  trailing,
  emptyHint,
  data,
}: GalleryTilesProps & { data: StudioAssetSectionData }) {
  const theme = useTheme();
  const token = useShareToken();
  const { items } = data;
  const hint = [styles.hint, { color: theme.textSecondary }];

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        {leadingSrc !== null && items.some((item) => item.src === leadingSrc) ? null : leading}
        {items.map((item) => {
          const isSelected = selectedSrc !== null && selectedSrc === item.src;
          const path = galleryTilePath(item);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={
                kind === 'sticker'
                  ? `Sticker „${item.title}“ hinzufügen`
                  : `Hintergrund „${item.title}“`
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
              {!isShareSrc(path) || token ? (
                <Image
                  source={{
                    uri: resolveChatUrl(path),
                    ...(isShareSrc(path) && token
                      ? { headers: { Authorization: `Bearer ${token}` } }
                      : {}),
                  }}
                  contentFit={kind === 'sticker' ? 'contain' : 'cover'}
                  style={kind === 'sticker' ? styles.sticker : styles.background}
                  accessibilityIgnoresInvertColors
                />
              ) : null}
            </Pressable>
          );
        })}
        {trailing}
      </View>
      {data.isLoading ? (
        <ActivityIndicator color={theme.textGreen} style={styles.loading} />
      ) : data.error && items.length === 0 ? (
        <View accessibilityRole="alert" style={styles.message}>
          <Text style={hint}>{galleryErrorText(kind)}</Text>
          <Button variant="outline" onPress={data.retry}>
            Erneut versuchen
          </Button>
        </View>
      ) : items.length === 0 && emptyHint ? (
        <Text style={hint}>{emptyHint}</Text>
      ) : null}
      {data.hasNextPage ? (
        <Button
          variant="outline"
          onPress={data.fetchNextPage}
          loading={data.isFetchingNextPage}
          disabled={data.isFetchingNextPage}
        >
          Mehr laden
        </Button>
      ) : null}
    </View>
  );
}

/** An empty tile for an action at the end of a picker row — upload, create, Entdecken. */
export function ActionTile({
  label,
  children,
  onPress,
  size = PICKER_TILE,
}: {
  label: string;
  children: ReactNode;
  onPress(): void;
  size?: number;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          width: size,
          height: size,
          borderColor: theme.border,
          backgroundColor: pressed ? theme.buttonBackground : 'transparent',
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.small },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xsmall },
  tile: {
    width: PICKER_TILE,
    height: PICKER_TILE,
    borderRadius: borderRadius.large,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sticker: { width: PICKER_TILE - spacing.small, height: PICKER_TILE - spacing.small },
  background: { width: '100%', height: '100%' },
  action: {
    borderRadius: borderRadius.large,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { ...typography.caption },
  message: { gap: spacing.xsmall, alignItems: 'flex-start' },
  loading: { alignSelf: 'flex-start', paddingVertical: spacing.small },
});
