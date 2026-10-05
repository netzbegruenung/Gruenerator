import {
  formatFeedDate,
  groupFeedKindMeta,
  isPinned,
  personInitials,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { canOpenInApp } from '../../hooks/useGroupContent';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, borderRadius, colors, spacing, typography } from '../../theme';
import { canHidePerson, feedItemPersonId } from '../../utils/hiddenMembers';
import { confirmHidePerson } from '../common/confirmHidePerson';
import { ReportSheet } from '../common/ReportSheet';

import { FEED_KIND_ICONS } from './feedIcons';
import { GroupPostBody } from './GroupPostBody';

/** Vorschau je Art — Sharepic als Bild, Text als Blatt, der Rest als Symbol. */
export function FeedPreview({ item, height }: { item: GroupFeedItem; height: number }) {
  const theme = useTheme();
  const isImage = item.kind === 'sharepic' || item.kind === 'sharepic-template';
  const paper = item.kind === 'doc' || item.kind === 'text';

  return (
    <View style={[styles.preview, { height, backgroundColor: theme.surface }]}>
      {item.post?.body ? (
        <Text style={[styles.postSnippet, { color: theme.text }]} numberOfLines={6}>
          {item.post.body}
        </Text>
      ) : isImage && item.thumbnailUrl ? (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
      ) : paper ? (
        <View style={[styles.paper, { backgroundColor: theme.card }]}>
          <Text style={[styles.paperTitle, { color: theme.text }]} numberOfLines={3}>
            {item.title}
          </Text>
          {[92, 100, 84, 70].map((w) => (
            <View
              key={w}
              style={[
                styles.paperLine,
                { width: `${w}%`, backgroundColor: theme.buttonBackground },
              ]}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.iconTile, { backgroundColor: theme.card }]}>
          <Ionicons name={FEED_KIND_ICONS[item.kind]} size={28} color={colors.primary[600]} />
        </View>
      )}
    </View>
  );
}

interface GroupFeedCardProps {
  item: GroupFeedItem;
  groupId: string;
  /** Für die Bilder eines Beitrags; die Dateien sind nur für Mitglieder lesbar. */
  token: string | null;
  canComment: boolean;
  onOpen: (item: GroupFeedItem) => void;
  onShowComments: (item: GroupFeedItem) => void;
}

export const GroupFeedCard = memo(function GroupFeedCard({
  item,
  groupId,
  token,
  canComment,
  onOpen,
  onShowComments,
}: GroupFeedCardProps) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const pinned = isPinned(item);
  const share = item.share;
  const kind = groupFeedKindMeta(item.kind);
  const openable = canOpenInApp(item);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [reportOpen, setReportOpen] = useState(false);
  const personId = feedItemPersonId(item);
  const reportable = !!(item.post || item.share) && (!personId || personId !== userId);
  const hidable = canHidePerson(personId, userId);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card },
        pinned
          ? { borderColor: dark ? colors.primary[800] : colors.primary[200], borderWidth: 1 }
          : styles.shadow,
      ]}
    >
      {pinned && (
        <View
          style={[
            styles.pinBanner,
            { backgroundColor: dark ? colors.primary[950] : colors.primary[50] },
          ]}
        >
          <Ionicons name="pin" size={14} color={dark ? colors.primary[200] : colors.primary[700]} />
          <Text
            style={[styles.pinText, { color: dark ? colors.primary[200] : colors.primary[700] }]}
          >
            {share?.pinnedByName ? `Angeheftet von ${share.pinnedByName}` : 'Angeheftet'}
          </Text>
        </View>
      )}

      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: colors.secondary[100] }]}>
          <Text style={styles.avatarText}>{personInitials(item.sharedByName)}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.author, { color: theme.text }]} numberOfLines={1}>
            {item.sharedByName ?? 'Jemand'}
          </Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
            {formatFeedDate(item.sharedAt)}
          </Text>
        </View>
        {hidable ? (
          <Pressable
            onPress={() => confirmHidePerson(personId, item.sharedByName)}
            accessibilityRole="button"
            accessibilityLabel={
              item.sharedByName ? `${item.sharedByName} ausblenden` : 'Person ausblenden'
            }
            hitSlop={6}
            style={styles.reportButton}
          >
            <Ionicons name="eye-off-outline" size={20} color={theme.textSecondary} />
          </Pressable>
        ) : null}
        {reportable ? (
          <Pressable
            onPress={() => setReportOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Melden"
            hitSlop={6}
            style={styles.reportButton}
          >
            <Ionicons name="flag-outline" size={20} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {share?.note ? <Text style={[styles.note, { color: theme.text }]}>{share.note}</Text> : null}

      {item.post ? (
        <GroupPostBody groupId={groupId} postId={item.id} post={item.post} token={token} />
      ) : (
        <>
          <Pressable
            onPress={() => onOpen(item)}
            disabled={!openable}
            accessibilityRole={openable ? 'button' : 'image'}
            accessibilityLabel={openable ? `${item.title} öffnen` : item.title}
            style={styles.previewWrap}
          >
            <FeedPreview item={item} height={240} />
          </Pressable>

          <View style={styles.titleBlock}>
            <Text style={styles.kindLabel}>{kind.label}</Text>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
        </>
      )}

      <View style={styles.footer}>
        {canComment && share ? (
          <Pressable
            onPress={() => onShowComments(item)}
            accessibilityRole="button"
            accessibilityLabel={`Kommentare anzeigen (${share.commentCount})`}
            hitSlop={6}
            style={styles.commentButton}
          >
            <Ionicons name="chatbubble-outline" size={20} color={theme.text} />
            <Text style={[styles.commentCount, { color: theme.text }]}>{share.commentCount}</Text>
          </Pressable>
        ) : null}
        <View style={styles.flex} />
        {openable ? (
          <Pressable
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}: Öffnen`}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
            ]}
          >
            <Text style={styles.ctaText}>Öffnen</Text>
          </Pressable>
        ) : null}
      </View>
      <ReportSheet
        target={
          reportOpen
            ? item.post
              ? { kind: 'group_post', targetId: item.id, groupId }
              : { kind: 'group_share', targetId: item.share?.shareId ?? item.id, groupId }
            : null
        }
        onClose={() => setReportOpen(false)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden' },
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pinText: { fontFamily: BODY_FONT, fontSize: 13, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondary[800],
  },
  reportButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  author: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '700' },
  meta: { fontFamily: BODY_FONT, fontSize: 13 },
  note: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  previewWrap: { marginTop: 12 },
  preview: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  paper: {
    position: 'absolute',
    left: 36,
    right: 36,
    top: 28,
    bottom: 0,
    borderTopLeftRadius: borderRadius.small,
    borderTopRightRadius: borderRadius.small,
    padding: 18,
    gap: 8,
  },
  paperTitle: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  paperLine: { height: 8, borderRadius: 4 },
  postSnippet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    padding: 14,
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
  },
  iconTile: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { paddingHorizontal: 14, paddingTop: 12, gap: 2 },
  kindLabel: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.primary[600],
  },
  title: { ...typography.h3, fontSize: 17, lineHeight: 22 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 10,
  },
  commentButton: {
    minHeight: 44,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentCount: { fontFamily: BODY_FONT, fontSize: 15 },
  flex: { flex: 1 },
  cta: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    justifyContent: 'center',
    marginRight: 6,
  },
  ctaText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '700', color: colors.white },
});
