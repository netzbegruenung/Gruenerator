import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';

import { shareBytesAsFile } from '../../services/share';
import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../theme';

import { buildArtifactCardView, type ArtifactData } from './artifactCardView';

import type { Theme } from '../../theme/colors';

/**
 * Inline card for a generated HTML/SVG artifact — the native counterpart of
 * web's ArtifactCard, minus its one real trick.
 *
 * Web's card RE-OPENS the artifact in the docked panel; mobile has no panel and
 * no surface that renders untrusted HTML, so there is nothing to re-open. The
 * card therefore stays a preview line — title, kind, length — and its action
 * hands the source to the share sheet, where an app that can render it takes
 * over. Deliberately no renderer of its own: the WebView containment for that
 * is being built separately, and a second, weaker one here would have to be
 * unbuilt again.
 */
export const ArtifactCard = memo(function ArtifactCard({
  artifact,
  theme,
}: {
  artifact: ArtifactData;
  theme: Theme;
}) {
  const view = useMemo(() => buildArtifactCardView(artifact), [artifact]);
  const [busy, setBusy] = useState(false);

  const handleShare = useCallback(async () => {
    setBusy(true);
    try {
      await shareBytesAsFile(
        new TextEncoder().encode(artifact.content),
        view.fileName,
        'Artefakt teilen',
        view.mimeType
      );
    } catch (error) {
      console.error('[ArtifactCard] share failed:', error);
      Alert.alert('Fehler', 'Das Artefakt konnte nicht geteilt werden.');
    } finally {
      setBusy(false);
    }
  }, [artifact.content, view.fileName, view.mimeType]);

  return (
    <Pressable
      onPress={() => void handleShare()}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`Artefakt „${view.title}“ teilen`}
      accessibilityState={{ disabled: busy }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.background,
          borderColor: theme.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.iconPill}>
        <Ionicons name="code-slash-outline" size={16} color={colors.primary[500]} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {view.title}
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {view.typeLabel} · {view.lineLabel}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary[500]} />
      ) : (
        <Ionicons name="share-outline" size={18} color={theme.textSecondary} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    marginTop: spacing.xsmall,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    padding: spacing.small,
  },
  iconPill: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.small,
    backgroundColor: colors.primary[500] + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...chatType.chatTitle,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
  meta: {
    ...chatType.chatMeta,
    marginTop: 1,
  },
});
