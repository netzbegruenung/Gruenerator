import { type StudioAssetItem } from '@gruenerator/contracts';
import { isShareSrc } from '@gruenerator/shared/stickers';
import {
  STUDIO_ASSET_MODERATION_BADGE,
  useStudioAssetToggles,
} from '@gruenerator/shared/studio-assets';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { resolveChatUrl } from '../../services/chatApiUrl';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { MenuActionSheet } from '../chat/MenuActionSheet';
import { SHEET_HANDOFF_MS } from '../common/CreateMenuSheet';
import { galleryTilePath } from '../profilbild/galleryModel';

import {
  asStudioAssetMenuId,
  buildStudioAssetActions,
  type StudioAssetMenuId,
} from './studioAssetModel';

/** The menu entries that leave the tile: they wait for the menu sheet to close. */
export type StudioAssetAction = Exclude<StudioAssetMenuId, 'like' | 'favorite'>;

interface StudioAssetTileProps {
  item: StudioAssetItem;
  size: number;
  /** Bearer token for share paths; null while it loads. */
  token: string | null;
  onAction: (action: StudioAssetAction, item: StudioAssetItem) => void;
}

export function StudioAssetTile({ item, size, token, onAction }: StudioAssetTileProps) {
  const theme = useTheme();
  const { toggleLike, toggleFavorite } = useStudioAssetToggles(item.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const path = galleryTilePath(item);
  const isSticker = item.kind === 'sticker';
  const moderation =
    item.isOwn && item.moderation !== 'ok' ? STUDIO_ASSET_MODERATION_BADGE[item.moderation] : null;

  const handleSelect = (raw: string) => {
    const id = asStudioAssetMenuId(raw);
    if (id === 'like') toggleLike(item);
    else if (id === 'favorite') toggleFavorite(item);
    else if (id) {
      // The menu sheet is still leaving; iOS refuses a second modal in the same tick.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onAction(id, item), SHEET_HANDOFF_MS);
    }
  };

  return (
    <View style={{ width: size }}>
      <Pressable
        onPress={() => setMenuOpen(true)}
        onLongPress={() => setMenuOpen(true)}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.thumb,
          { width: size, height: size, backgroundColor: theme.surface },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Aktionen für „${item.title}“`}
      >
        {!isShareSrc(path) || token ? (
          <Image
            source={{
              uri: resolveChatUrl(path),
              ...(isShareSrc(path) && token
                ? { headers: { Authorization: `Bearer ${token}` } }
                : {}),
            }}
            contentFit={isSticker ? 'contain' : 'cover'}
            style={isSticker ? styles.sticker : StyleSheet.absoluteFill}
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <View style={styles.more} pointerEvents="none">
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.white} />
        </View>
      </Pressable>
      <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
        {item.isOwn
          ? item.visibility === 'public'
            ? 'Öffentlich'
            : 'Privat'
          : (item.authorName ?? 'Unbekannt')}
      </Text>
      {moderation ? (
        <View
          style={[styles.badge, { borderColor: colors.error[500] }]}
          accessible
          accessibilityLabel={`${moderation.label}. ${moderation.hint}`}
        >
          <Text style={[styles.badgeText, { color: colors.error[600] }]}>{moderation.label}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={() => toggleLike(item)}
          hitSlop={6}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={`Gefällt mir (${item.likesCount})`}
          accessibilityState={{ selected: item.liked }}
        >
          <Ionicons
            name={item.liked ? 'heart' : 'heart-outline'}
            size={16}
            color={item.liked ? colors.primary[600] : theme.textSecondary}
          />
          <Text style={[styles.count, { color: theme.textSecondary }]}>{item.likesCount}</Text>
        </Pressable>
        <Pressable
          onPress={() => toggleFavorite(item)}
          hitSlop={6}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel="Merken"
          accessibilityState={{ selected: item.favorited }}
        >
          <Ionicons
            name={item.favorited ? 'bookmark' : 'bookmark-outline'}
            size={16}
            color={item.favorited ? colors.primary[600] : theme.textSecondary}
          />
        </Pressable>
      </View>
      <MenuActionSheet
        visible={menuOpen}
        theme={theme}
        heading={item.title}
        actions={buildStudioAssetActions(item)}
        onSelect={handleSelect}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  sticker: { width: '80%', height: '80%' },
  more: {
    position: 'absolute',
    top: spacing.xxsmall,
    right: spacing.xxsmall,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 18, 16, 0.55)',
  },
  title: { ...typography.caption, fontWeight: '600', marginTop: spacing.xxsmall },
  meta: { ...typography.caption, fontSize: 11 },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { ...typography.caption, fontSize: 11, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    marginTop: 2,
    marginBottom: spacing.small,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 28 },
  count: { ...typography.caption, fontSize: 12 },
});
