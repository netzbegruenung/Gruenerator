import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Linking,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';
import type { NotebookSource } from '../../stores/notebookChatStore';

interface CitationModalProps {
  visible: boolean;
  onClose: () => void;
  citation: NotebookSource | null;
  citationIndex: string;
}

export function CitationModal({ visible, onClose, citation, citationIndex }: CitationModalProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  if (!citation) return null;

  const handleOpenDocument = () => {
    if (citation.url) {
      Linking.openURL(citation.url);
    }
  };

  const similarityPercent = citation.similarity_score
    ? Math.round(citation.similarity_score * 100)
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{citationIndex}</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Quelle</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {citation.cited_text && (
            <View
              style={[
                styles.citedTextContainer,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View style={[styles.quoteBar, { backgroundColor: colors.primary[600] }]} />
              <Text style={[styles.citedText, { color: theme.text }]}>„{citation.cited_text}"</Text>
            </View>
          )}

          {(citation.title || citation.snippet) && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Dokument</Text>
              <Text style={[styles.documentTitle, { color: theme.text }]}>{citation.title}</Text>
              {citation.snippet && !citation.cited_text && (
                <Text style={[styles.snippet, { color: theme.textSecondary }]} numberOfLines={4}>
                  {citation.snippet}
                </Text>
              )}
            </View>
          )}

          {citation.collectionName && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Sammlung</Text>
              <Text style={[styles.collectionName, { color: theme.text }]}>
                {citation.collectionName}
              </Text>
            </View>
          )}

          {similarityPercent !== null && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Relevanz</Text>
              <View style={styles.relevanceContainer}>
                <View style={[styles.relevanceBar, { backgroundColor: theme.border }]}>
                  <View
                    style={[
                      styles.relevanceFill,
                      {
                        width: `${similarityPercent}%`,
                        backgroundColor: colors.primary[600],
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.relevanceText, { color: theme.text }]}>
                  {similarityPercent}%
                </Text>
              </View>
            </View>
          )}

          {citation.url && (
            <Pressable
              style={[styles.openButton, { borderColor: colors.primary[600] }]}
              onPress={handleOpenDocument}
            >
              <Ionicons name="open-outline" size={18} color={colors.primary[600]} />
              <Text style={styles.openButtonText}>Dokument öffnen</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.large,
    borderBottomWidth: 1,
    gap: spacing.small,
  },
  headerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    ...typography.h3,
  },
  closeButton: {
    position: 'absolute',
    right: spacing.medium,
    padding: spacing.small,
  },
  content: {
    padding: spacing.large,
    gap: spacing.large,
  },
  citedTextContainer: {
    flexDirection: 'row',
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    overflow: 'hidden',
  },
  quoteBar: {
    width: 4,
  },
  citedText: {
    flex: 1,
    padding: spacing.medium,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  section: {
    gap: spacing.xsmall,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  snippet: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xsmall,
  },
  collectionName: {
    fontSize: 15,
    lineHeight: 20,
  },
  relevanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  relevanceBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  relevanceFill: {
    height: '100%',
    borderRadius: 4,
  },
  relevanceText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.large,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    marginTop: spacing.medium,
  },
  openButtonText: {
    color: colors.primary[600],
    fontSize: 15,
    fontWeight: '600',
  },
});
