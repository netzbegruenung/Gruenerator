import {
  formatFeedDate,
  groupFeedByKind,
  groupFeedKindMeta,
  isPinned,
  type GroupFeedItem,
  type GroupFeedKind,
} from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, colors, typography } from '../../theme';

import { FEED_KIND_ICONS } from './feedIcons';
import { FeedPreview } from './GroupFeedCard';

/** Kachelmaß je Art: Sharepics hochkant, Texte quer, der Rest klein. */
const TILE: Partial<Record<GroupFeedKind, [number, number]>> = {
  'sharepic-template': [150, 188],
  sharepic: [150, 188],
  doc: [200, 150],
  text: [200, 150],
};
const DEFAULT_TILE: [number, number] = [150, 110];

interface GroupKindRowsProps {
  items: GroupFeedItem[];
  showPinned: boolean;
  onOpen: (item: GroupFeedItem) => void;
}

/** „Alle": angeheftete Leiste, dann eine horizontale Reihe je Art. */
export function GroupKindRows({ items, showPinned, onOpen }: GroupKindRowsProps) {
  const theme = useTheme();
  const pinned = items.filter(isPinned);

  return (
    <View style={styles.root}>
      {showPinned && pinned.length > 0 && (
        <View style={styles.section}>
          <View style={styles.pinnedHeader}>
            <Ionicons name="pin" size={13} color={colors.primary[600]} />
            <Text style={styles.pinnedLabel} accessibilityRole="header">
              Angeheftet
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {pinned.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => onOpen(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${groupFeedKindMeta(item.kind).label}`}
                style={[styles.pinChip, { backgroundColor: theme.card }]}
              >
                <View style={[styles.pinThumb, { backgroundColor: colors.primary[50] }]}>
                  {item.thumbnailUrl ? (
                    <Image
                      source={{ uri: item.thumbnailUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : (
                    <Ionicons
                      name={FEED_KIND_ICONS[item.kind]}
                      size={22}
                      color={colors.primary[600]}
                    />
                  )}
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.pinTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.small, { color: theme.textSecondary }]}>
                    {groupFeedKindMeta(item.kind).label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {groupFeedByKind(items).map((section) => {
        const [w, h] = TILE[section.id] ?? DEFAULT_TILE;
        return (
          <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]} accessibilityRole="header">
                {section.plural}
              </Text>
              <Text style={[styles.count, { color: theme.textSecondary }]}>
                {section.items.length}
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
            >
              {section.items.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => onOpen(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  style={{ width: w, gap: 6 }}
                >
                  <View style={[styles.tile, { backgroundColor: theme.card }]}>
                    <FeedPreview item={item} height={h} />
                  </View>
                  <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.small, { color: theme.textSecondary }]} numberOfLines={1}>
                    {[item.sharedByName?.split(' ')[0], formatFeedDate(item.sharedAt, 'short')]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 20 },
  section: { gap: 10 },
  pinnedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20 },
  pinnedLabel: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.primary[700],
  },
  row: { gap: 12, paddingHorizontal: 20, paddingBottom: 4 },
  pinChip: {
    width: 230,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 14,
  },
  pinThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinTitle: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
  flex: { flex: 1, minWidth: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 20 },
  sectionTitle: { ...typography.h3, fontSize: 19, lineHeight: 24 },
  count: { fontFamily: BODY_FONT, fontSize: 14 },
  tile: { borderRadius: 14, overflow: 'hidden' },
  tileTitle: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
  small: { fontFamily: BODY_FONT, fontSize: 12 },
});
