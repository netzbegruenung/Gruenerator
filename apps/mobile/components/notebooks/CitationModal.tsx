import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Linking,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';

import { apiRequest } from '../../services/api';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';

import type { NotebookSource } from '../../stores/notebookChatStore';

interface ContextChunk {
  text: string;
  chunkIndex: number;
  isCenter: boolean;
}

interface ChunkContextData {
  documentId: string;
  centerChunkIndex: number;
  centerChunk: { text: string; chunkIndex: number };
  contextChunks: ContextChunk[];
}

interface CitationModalProps {
  visible: boolean;
  onClose: () => void;
  citation: NotebookSource | null;
  citationIndex: string;
}

export function CitationModal({ visible, onClose, citation, citationIndex }: CitationModalProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [contextData, setContextData] = useState<ChunkContextData | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const highlightRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible || !citation?.documentId || citation.chunk_index === undefined) {
      setContextData(null);
      return;
    }

    let cancelled = false;
    setIsLoadingContext(true);

    const fetchContext = async () => {
      try {
        const collection = citation.collection_id || 'user';
        const params = new URLSearchParams({
          chunkIndex: String(citation.chunk_index),
          window: '2',
          collection,
        });
        const response = await apiRequest<{ success: boolean; data: ChunkContextData }>(
          'get',
          `/documents/qdrant/${citation.documentId}/chunk-context?${params}`
        );
        if (!cancelled && response?.data) {
          setContextData(response.data);
        }
      } catch {
        // Silently fail — we still show the cited_text
      } finally {
        if (!cancelled) setIsLoadingContext(false);
      }
    };

    fetchContext();
    return () => {
      cancelled = true;
    };
  }, [visible, citation?.documentId, citation?.chunk_index, citation?.collection_id]);

  if (!citation) return null;

  const handleOpenDocument = () => {
    if (citation.url) {
      Linking.openURL(citation.url);
    }
  };

  const similarityPercent = citation.similarity_score
    ? Math.round(citation.similarity_score * 100)
    : null;

  const hasContext =
    contextData && contextData.contextChunks && contextData.contextChunks.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          {citationIndex ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{citationIndex}</Text>
            </View>
          ) : null}
          <Text style={[styles.title, { color: theme.text }]}>Quelle</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Document info */}
          {citation.title && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Dokument</Text>
              <Pressable
                onPress={citation.url ? handleOpenDocument : undefined}
                disabled={!citation.url}
              >
                <Text
                  style={[
                    styles.documentTitle,
                    { color: citation.url ? colors.primary[600] : theme.text },
                  ]}
                >
                  {citation.title}
                </Text>
              </Pressable>
              {citation.collectionName && (
                <Text style={[styles.collectionName, { color: theme.textSecondary }]}>
                  {citation.collectionName}
                </Text>
              )}
            </View>
          )}

          {/* Relevance */}
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

          {/* Context section */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
              {hasContext ? 'Kontext' : 'Zitat'}
            </Text>

            {isLoadingContext && (
              <View style={styles.contextLoading}>
                <ActivityIndicator size="small" color={colors.primary[600]} />
                <Text style={[styles.contextLoadingText, { color: theme.textSecondary }]}>
                  Kontext wird geladen...
                </Text>
              </View>
            )}

            {hasContext ? (
              <View style={styles.contextContainer}>
                {contextData.contextChunks.map((chunk) => (
                  <View
                    key={chunk.chunkIndex}
                    ref={chunk.isCenter ? highlightRef : undefined}
                    style={[
                      styles.contextChunk,
                      chunk.isCenter && styles.contextChunkHighlight,
                      chunk.isCenter && { borderLeftColor: colors.primary[600] },
                      !chunk.isCenter && { opacity: 0.6 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.contextChunkText,
                        { color: theme.text },
                        chunk.isCenter && { fontWeight: '500' },
                      ]}
                    >
                      {chunk.text}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              citation.cited_text && (
                <View
                  style={[
                    styles.citedTextContainer,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <View style={[styles.quoteBar, { backgroundColor: colors.primary[600] }]} />
                  <Text style={[styles.citedText, { color: theme.text }]}>
                    &bdquo;{citation.cited_text}&ldquo;
                  </Text>
                </View>
              )
            )}
          </View>

          {/* Snippet fallback (when no cited_text and no context) */}
          {!citation.cited_text && !hasContext && citation.snippet && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Auszug</Text>
              <Text style={[styles.snippet, { color: theme.textSecondary }]}>
                {citation.snippet}
              </Text>
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
  collectionName: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
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
  contextLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.medium,
  },
  contextLoadingText: {
    fontSize: 14,
  },
  contextContainer: {
    gap: spacing.xsmall,
  },
  contextChunk: {
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
  },
  contextChunkHighlight: {
    borderLeftWidth: 3,
    paddingLeft: spacing.small,
    borderRadius: borderRadius.small,
  },
  contextChunkText: {
    fontSize: 14,
    lineHeight: 21,
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
  snippet: {
    fontSize: 14,
    lineHeight: 20,
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
