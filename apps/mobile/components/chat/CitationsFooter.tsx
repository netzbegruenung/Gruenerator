import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { spacing, borderRadius } from '../../theme';

import { CitationDetailSheet } from './CitationDetailSheet';

import type { Theme } from '../../theme/colors';
import type { Citation } from '@gruenerator/chat';

interface Props {
  citations: Citation[];
  theme: Theme;
  fetchFullText?: (url: string, collectionId: string) => Promise<string | null>;
}

export function CitationsFooter({ citations, theme, fetchFullText }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  const handleClose = useCallback(() => setSelectedCitation(null), []);

  if (!citations || citations.length === 0) return null;

  return (
    <View style={[styles.container, { borderTopColor: theme.border }]}>
      {/* Collapsed trigger */}
      <Pressable style={styles.trigger} onPress={() => setIsOpen(!isOpen)} hitSlop={8}>
        <Ionicons name="attach-outline" size={14} color={theme.textSecondary} />
        <Text style={[styles.triggerText, { color: theme.textSecondary }]}>
          {citations.length} Quellen
        </Text>
        <Ionicons
          name={isOpen ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={theme.textSecondary}
        />
      </Pressable>

      {isOpen &&
        citations.slice(0, 5).map((citation, idx) => (
          <Pressable
            key={citation.id ?? idx}
            style={({ pressed }) => [
              styles.item,
              { backgroundColor: theme.background, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => setSelectedCitation(citation)}
          >
            <View style={styles.itemContent}>
              <Text style={[styles.number, { color: theme.textSecondary }]}>
                [{citation.id ?? idx + 1}]
              </Text>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                {citation.title || citation.url}
              </Text>
            </View>
          </Pressable>
        ))}
      {selectedCitation && (
        <CitationDetailSheet
          citation={selectedCitation}
          theme={theme}
          onClose={handleClose}
          fetchFullText={fetchFullText}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.small,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xxsmall,
  },
  triggerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  item: {
    paddingHorizontal: spacing.xsmall,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.small,
    marginBottom: 2,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
  },
  number: {
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
});
