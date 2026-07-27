import { useSocialPostLiveStore } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';

import { copyToClipboard } from '../../services/share';
import { colors, spacing, borderRadius, chatType } from '../../theme';

import {
  buildSocialPostView,
  COLLAPSED_LINES,
  SOCIAL_POST_DOC_URL,
  type PostSegment,
} from './socialPostView';

import type { Theme } from '../../theme/colors';
import type { SocialPostPayload } from '@gruenerator/contracts';

/** Amber, matching web's "Experimentell" chip. Not a theme token on either side. */
const EXPERIMENTAL = '#B45309';

function PostText({
  segments,
  collapsed,
  theme,
}: {
  segments: PostSegment[];
  collapsed: boolean;
  theme: Theme;
}) {
  return (
    <Text
      style={[styles.postText, { color: theme.text }]}
      {...(collapsed ? { numberOfLines: COLLAPSED_LINES } : {})}
    >
      {segments.map((segment, index) =>
        segment.isHashtag ? (
          <Text key={index} style={styles.hashtag}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        )
      )}
    </Text>
  );
}

/**
 * Native counterpart of web's `SocialPostCard` (EXPERIMENTAL): the generated
 * platform text with its character budget.
 *
 * Two halves of web's card are deliberately absent, both for the same reason —
 * they belong to the sharepic artifact story, which mobile cannot render yet:
 * the sharepic column beside the text, and the "Im Chat bearbeiten" toggle that
 * docks a post in web's artifact panel. Editing still works the way it does
 * everywhere on the phone — by asking in the chat; the live store below is what
 * makes the result land in this card.
 */
export const SocialPostCard = memo(function SocialPostCard({
  post,
  theme,
}: {
  post: SocialPostPayload;
  theme: Theme;
}) {
  // The message payload is only the seed. Chat edits arrive as
  // `social_post_updated` and land in the live store, which the shared SSE
  // parser writes on mobile too.
  const live = useSocialPostLiveStore((s) => s.entries[post.postId]) ?? post;
  useEffect(() => {
    useSocialPostLiveStore.getState().upsertEntry(post);
  }, [post]);

  const view = useMemo(() => buildSocialPostView(live), [live]);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void copyToClipboard(live.text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [live.text]);

  const openDocs = useCallback(() => {
    void Linking.openURL(SOCIAL_POST_DOC_URL);
  }, []);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Ionicons name="megaphone-outline" size={16} color={colors.primary[500]} />
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {view.title}
        </Text>
        <Pressable
          onPress={openDocs}
          style={styles.experimentalChip}
          accessibilityRole="link"
          accessibilityLabel="Experimentelles Feature — zur Dokumentation"
        >
          <Ionicons name="flask-outline" size={11} color={EXPERIMENTAL} />
          <Text style={styles.experimentalText}>Experimentell</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <PostText
          segments={view.segments}
          collapsed={view.isCollapsible && !expanded}
          theme={theme}
        />
        {view.isCollapsible ? (
          <Pressable onPress={() => setExpanded((e) => !e)} style={styles.expandButton}>
            <Text style={[styles.expandText, { color: colors.primary[500] }]}>
              {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        {view.version ? (
          <Text style={[styles.meta, { color: theme.textSecondary }]}>v{view.version}</Text>
        ) : null}
        <Text
          style={[
            styles.meta,
            styles.charCount,
            { color: view.overLimit ? colors.semantic.error : theme.textSecondary },
          ]}
          accessibilityLabel={
            view.overLimit
              ? `${view.charCount} Zeichen, über dem ${view.platformLabel}-Limit von ${view.maxChars}`
              : `${view.charCount} von ${view.maxChars} Zeichen`
          }
        >
          {view.charCount}/{view.maxChars}
        </Text>
        <Pressable
          onPress={handleCopy}
          style={styles.copyButton}
          accessibilityLabel="Post-Text kopieren"
        >
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={16}
            color={copied ? colors.primary[500] : theme.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.medium,
    marginVertical: spacing.xsmall,
    borderWidth: 1,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderBottomWidth: 1,
  },
  title: {
    ...chatType.chatTitle,
    flex: 1,
    fontWeight: '600',
  },
  experimentalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: EXPERIMENTAL,
    paddingHorizontal: spacing.xxsmall,
    paddingVertical: 1,
  },
  experimentalText: {
    ...chatType.chatMicro,
    color: EXPERIMENTAL,
    fontWeight: '600',
  },
  body: {
    padding: spacing.small,
  },
  postText: {
    ...chatType.chatSecondary,
  },
  hashtag: {
    color: colors.primary[500],
    fontWeight: '600',
  },
  expandButton: {
    marginTop: spacing.xsmall,
    alignSelf: 'flex-start',
  },
  expandText: {
    ...chatType.chatLabel,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderTopWidth: 1,
  },
  meta: {
    ...chatType.chatMeta,
  },
  charCount: {
    fontVariant: ['tabular-nums'],
  },
  copyButton: {
    padding: spacing.xxsmall,
  },
});
