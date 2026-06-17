import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
  ScrollView,
  useColorScheme,
} from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

import type { Theme } from '../../theme/colors';
import type { Citation } from '@gruenerator/chat';

interface Props {
  citation: Citation | null;
  theme: Theme;
  onClose: () => void;
  fetchFullText?: (url: string, collectionId: string) => Promise<string | null>;
}

const MAX_DISPLAY_LENGTH = 50_000;

/**
 * Citation detail bottom sheet — built on the shared RN-Modal `BottomSheet` (the
 * same one every other sheet uses), not `@expo/ui` whose native ModalBottomSheetView
 * lacks a `partialExpand` handler in this build. Shows the cited passage and can
 * load the full source text in place via `fetchFullText`.
 */
export function CitationDetailSheet({ citation, theme, onClose, fetchFullText }: Props) {
  const isDark = useColorScheme() === 'dark';
  const [fullText, setFullText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset loaded text/error whenever a different citation opens the sheet.
  useEffect(() => {
    setFullText(null);
    setError(null);
    setIsLoading(false);
  }, [citation?.documentId, citation?.url]);

  const handleLoadFullText = useCallback(async () => {
    if (!fetchFullText || !citation?.url || !citation?.collectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const text = await fetchFullText(citation.url, citation.collectionId);
      if (text) {
        setFullText(
          text.length > MAX_DISPLAY_LENGTH ? text.slice(0, MAX_DISPLAY_LENGTH) + '\n\n[...]' : text
        );
      } else {
        setError('Volltext nicht verfügbar');
      }
    } catch {
      setError('Fehler beim Laden');
    } finally {
      setIsLoading(false);
    }
  }, [fetchFullText, citation?.url, citation?.collectionId]);

  const canLoadFullText = fetchFullText && citation?.url && citation?.collectionId && !fullText;

  return (
    <BottomSheet visible={!!citation} onClose={onClose} padded maxHeight="85%">
      {citation && (
        <>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {citation.title || citation.url}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.metaRow}>
            {citation.collectionName && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: isDark ? colors.primary[950] : colors.primary[100] },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: isDark ? theme.textGreen : colors.primary[700] },
                  ]}
                >
                  {citation.collectionName}
                </Text>
              </View>
            )}
            {citation.contentType && (
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                {citation.contentType}
              </Text>
            )}
            {citation.domain && (
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                {citation.domain}
              </Text>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <ScrollView style={styles.scroll}>
            <Text style={[styles.body, { color: theme.text }]}>
              {fullText || citation.citedText || citation.snippet}
            </Text>
            {error && <Text style={styles.errorText}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            {canLoadFullText && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: isDark ? colors.primary[950] : colors.primary[50],
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                onPress={handleLoadFullText}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={theme.textGreen} />
                ) : (
                  <Ionicons name="document-text-outline" size={16} color={theme.textGreen} />
                )}
                <Text style={[styles.actionText, { color: theme.textGreen }]}>
                  {isLoading ? 'Wird geladen...' : 'Volltext laden'}
                </Text>
              </Pressable>
            )}

            {citation.url && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => Linking.openURL(citation.url)}
              >
                <Ionicons name="open-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.actionText, { color: theme.textSecondary }]}>
                  Im Browser öffnen
                </Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.small,
    marginBottom: spacing.xsmall,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.small,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaText: {
    fontSize: 11,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.small,
  },
  scroll: {
    maxHeight: 360,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: spacing.xsmall,
  },
  actions: {
    marginTop: spacing.medium,
    gap: spacing.xsmall,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
