import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, ActivityIndicator } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import type { Citation } from '@gruenerator/chat';

interface Props {
  citation: Citation | null;
  theme: Theme;
  onClose: () => void;
  fetchFullText?: (url: string, collectionId: string) => Promise<string | null>;
}

const MAX_DISPLAY_LENGTH = 50_000;

export function CitationDetailSheet({ citation, theme, onClose, fetchFullText }: Props) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['50%', '85%'], []);
  const [fullText, setFullText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    []
  );

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
        bottomSheetRef.current?.snapToIndex(1);
      } else {
        setError('Volltext nicht verfügbar');
      }
    } catch {
      setError('Fehler beim Laden');
    } finally {
      setIsLoading(false);
    }
  }, [fetchFullText, citation?.url, citation?.collectionId]);

  if (!citation) return null;

  const canLoadFullText = fetchFullText && citation.url && citation.collectionId && !fullText;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onClose={onClose}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.surface }}
      handleIndicatorStyle={{ backgroundColor: theme.textSecondary }}
    >
      <BottomSheetScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={3}>
          {citation.title || citation.url}
        </Text>

        <View style={styles.metaRow}>
          {citation.collectionName && (
            <View style={[styles.badge, { backgroundColor: colors.primary[100] }]}>
              <Text style={[styles.badgeText, { color: colors.primary[700] }]}>
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
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>{citation.domain}</Text>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <Text style={[styles.body, { color: theme.text }]}>
          {fullText || citation.citedText || citation.snippet}
        </Text>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.actions}>
          {canLoadFullText && (
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.primary[50], opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={handleLoadFullText}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary[600]} />
              ) : (
                <Ionicons name="document-text-outline" size={16} color={colors.primary[600]} />
              )}
              <Text style={[styles.actionText, { color: colors.primary[600] }]}>
                {isLoading ? 'Wird geladen...' : 'Volltext laden'}
              </Text>
            </Pressable>
          )}

          {citation.url && (
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: theme.background, opacity: pressed ? 0.7 : 1 },
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
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.medium,
    paddingBottom: spacing.xxlarge,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginTop: spacing.xsmall,
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
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
