import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { useLayout } from '../../hooks/useLayout';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import {
  borderRadius,
  colors,
  darkTheme,
  lightTheme,
  spacing,
  BODY_FONT,
  HEADING_FONT_BOLD,
  HEADING_FONT_SEMIBOLD,
} from '../../theme';
import { getToolTheme } from '../../theme/toolTheme';
import { BottomSheet } from '../common/BottomSheet';
import { MenuIcon } from '../icons/WebMirrorIcons';

import { type ToolDef } from './toolsConfig';

/** Tools in the dock itself; the rest sit behind „Weitere". */
const DOCKED = 3;
// The dock grows with the screen within a range: a phone gets tiles worth
// tapping, a tablet does not get dinner plates.
const BOX_SHARE = 0.78;
const BOX_MIN = 60;
const BOX_MAX = 84;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const FAVORITE_ACTION = 'favorite';

/**
 * The Arbeiten tab's tools as one row of icons: the first three (favourites
 * first, the caller sorts), then „Weitere" for the rest in a sheet. A
 * horizontal strip of large tiles hid three of five tools off screen and fought
 * the workplace pager for every drag; a row that fits needs neither.
 *
 * Favouriting moves a tool into the dock: a long press on a docked icon, or the
 * star on a row in the sheet. The descriptions the large tiles carried live on
 * as accessibility hints and in the sheet.
 */
export function ToolDock({ tools }: { tools: ToolDef[] }) {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const router = useRouter();
  const favorites = useToolFavoritesStore((s) => s.favorites);
  const toggleFavorite = useToolFavoritesStore((s) => s.toggleFavorite);
  const [moreOpen, setMoreOpen] = useState(false);
  const { contentWidth } = useLayout();
  const box = Math.round(clamp((contentWidth / (DOCKED + 1)) * BOX_SHARE, BOX_MIN, BOX_MAX));
  const glyph = Math.round(box * 0.48);
  const boxStyle = { width: box, height: box, borderRadius: Math.round(box * 0.3) };
  const labelStyle = { fontSize: clamp(box / 5, 12, 14), maxWidth: box + spacing.medium };

  const docked = tools.slice(0, DOCKED);
  const more = tools.slice(DOCKED);

  const favoriteLabel = (tool: ToolDef) =>
    favorites.includes(tool.id)
      ? `${tool.title} nicht mehr favorisieren`
      : `${tool.title} favorisieren`;
  const toggle = (tool: ToolDef) => {
    void Haptics.selectionAsync();
    toggleFavorite(tool.id);
  };

  return (
    <>
      <View style={styles.dock}>
        {docked.map((tool) => {
          const tone = getToolTheme(tool.id, isDark);
          return (
            <Pressable
              key={tool.id}
              onPress={() => router.push(tool.route as Href)}
              onLongPress={() => toggle(tool)}
              accessibilityRole="button"
              accessibilityLabel={tool.title}
              accessibilityHint={tool.description}
              accessibilityActions={[{ name: FAVORITE_ACTION, label: favoriteLabel(tool) }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === FAVORITE_ACTION) toggle(tool);
              }}
              style={styles.slot}
            >
              {({ pressed }) => (
                <>
                  <View
                    style={[
                      styles.iconBox,
                      boxStyle,
                      { backgroundColor: tone.tile, transform: [{ scale: pressed ? 0.94 : 1 }] },
                    ]}
                  >
                    <MenuIcon name={tool.icon} size={glyph} color={tone.icon} />
                    {favorites.includes(tool.id) ? (
                      <Ionicons
                        name="star"
                        size={12}
                        color={colors.secondary[500]}
                        style={styles.badge}
                      />
                    ) : null}
                  </View>
                  <Text
                    style={[styles.label, labelStyle, { color: theme.text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {tool.title}
                  </Text>
                </>
              )}
            </Pressable>
          );
        })}
        {more.length > 0 ? (
          <Pressable
            onPress={() => setMoreOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Weitere Werkzeuge"
            accessibilityHint={more.map((t) => t.title).join(', ')}
            style={styles.slot}
          >
            {({ pressed }) => (
              <>
                <View
                  style={[
                    styles.iconBox,
                    boxStyle,
                    {
                      backgroundColor: isDark ? colors.grey[800] : colors.grey[100],
                      transform: [{ scale: pressed ? 0.94 : 1 }],
                    },
                  ]}
                >
                  <Ionicons
                    name="grid-outline"
                    size={Math.round(glyph * 0.92)}
                    color={theme.text}
                  />
                </View>
                <Text
                  style={[styles.label, labelStyle, { color: theme.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Weitere
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      <BottomSheet visible={moreOpen} onClose={() => setMoreOpen(false)} padded>
        <Text accessibilityRole="header" style={[styles.sheetTitle, { color: theme.text }]}>
          Weitere Werkzeuge
        </Text>
        {more.map((tool) => {
          const tone = getToolTheme(tool.id, isDark);
          const isFavorite = favorites.includes(tool.id);
          return (
            <View key={tool.id} style={styles.sheetRow}>
              <Pressable
                onPress={() => {
                  setMoreOpen(false);
                  router.push(tool.route as Href);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.sheetMain,
                  { backgroundColor: pressed ? theme.surface : 'transparent' },
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: tone.tile }]}>
                  <MenuIcon name={tool.icon} size={22} color={tone.icon} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>{tool.title}</Text>
                  <Text style={[styles.rowDesc, { color: theme.textSecondary }]}>
                    {tool.description}
                  </Text>
                </View>
              </Pressable>
              {/* Beside the row, not inside it: a nested pressable swallows the
                  outer press on Android. */}
              <Pressable
                onPress={() => toggle(tool)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={favoriteLabel(tool)}
                style={styles.star}
              >
                <Ionicons
                  name={isFavorite ? 'star' : 'star-outline'}
                  size={20}
                  color={isFavorite ? colors.secondary[500] : theme.textSecondary}
                />
              </Pressable>
            </View>
          );
        })}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  dock: { flexDirection: 'row', justifyContent: 'space-between' },
  slot: { flex: 1, alignItems: 'center', gap: spacing.xsmall },
  iconBox: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 5, right: 5 },
  label: { fontFamily: HEADING_FONT_SEMIBOLD },
  sheetTitle: { fontFamily: HEADING_FONT_BOLD, fontSize: 18, paddingBottom: spacing.small },
  sheetRow: { flexDirection: 'row', alignItems: 'center' },
  sheetMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 16 },
  rowDesc: { fontFamily: BODY_FONT, fontSize: 13, marginTop: 1 },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
