import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Platform,
  useColorScheme,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNotebookChat } from '../../hooks/useNotebookChat';
import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { colors, spacing, lightTheme, darkTheme, borderRadius } from '../../theme';
import { MicButton } from '../common';

import { CitationModal } from './CitationModal';
import { CitationTextRenderer } from './CitationTextRenderer';

import type { NotebookChatMessage, NotebookSource } from '../../stores/notebookChatStore';

interface DocumentGroup {
  documentId: string;
  title: string;
  url?: string;
  relevance?: number;
  citations: NotebookSource[];
  collectionName?: string;
}

function groupSourcesByDocument(sources: NotebookSource[]): DocumentGroup[] {
  const groupMap = new Map<string, DocumentGroup>();

  for (const source of sources) {
    const key = source.documentId || source.title || 'unknown';
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        documentId: key,
        title: source.title,
        url: source.url,
        relevance: source.similarity_score,
        citations: [],
        collectionName: source.collectionName,
      });
    }
    const group = groupMap.get(key)!;
    group.citations.push(source);
    if (
      source.similarity_score &&
      (!group.relevance || source.similarity_score > group.relevance)
    ) {
      group.relevance = source.similarity_score;
    }
  }

  // Sort by first citation index (lowest first)
  return Array.from(groupMap.values()).sort((a, b) => {
    const aIdx = a.citations[0]?.index ? Number(a.citations[0].index) : Infinity;
    const bIdx = b.citations[0]?.index ? Number(b.citations[0].index) : Infinity;
    return aIdx - bIdx;
  });
}

function DocumentGroupItem({
  group,
  onCitationPress,
}: {
  group: DocumentGroup;
  onCitationPress: (citation: NotebookSource, index: string) => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const relevancePercent = group.relevance ? Math.round(group.relevance * 100) : null;

  return (
    <View style={[styles.docGroup, { borderColor: theme.border }]}>
      <View style={styles.docGroupHeader}>
        <Pressable
          style={styles.docGroupTitleRow}
          onPress={group.url ? () => Linking.openURL(group.url!) : undefined}
          disabled={!group.url}
        >
          <Ionicons
            name={group.url ? 'link-outline' : 'document-outline'}
            size={14}
            color={colors.primary[600]}
          />
          <Text
            style={[styles.docGroupTitle, { color: group.url ? colors.primary[600] : theme.text }]}
            numberOfLines={2}
          >
            {group.title}
          </Text>
        </Pressable>
        {relevancePercent !== null && (
          <Text style={[styles.relevanceBadge, { color: theme.textSecondary }]}>
            {relevancePercent}%
          </Text>
        )}
      </View>

      {group.collectionName && (
        <Text style={[styles.docGroupCollection, { color: theme.textSecondary }]}>
          {group.collectionName}
        </Text>
      )}

      {group.citations.map((citation, idx) => {
        if (!citation.cited_text) return null;
        const citationIndex = citation.index?.toString() || '';
        return (
          <Pressable
            key={idx}
            style={[styles.citationExcerpt, { backgroundColor: theme.surface }]}
            onPress={() => onCitationPress(citation, citationIndex)}
          >
            {citationIndex ? (
              <View style={styles.citationExcerptBadge}>
                <Text style={styles.citationExcerptBadgeText}>{citationIndex}</Text>
              </View>
            ) : null}
            <Text style={[styles.citationExcerptText, { color: theme.text }]} numberOfLines={3}>
              &bdquo;{citation.cited_text.replace(/\*\*/g, '')}&ldquo;
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MessageBubble({ message }: { message: NotebookChatMessage }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isUser = message.type === 'user';
  const isError = message.type === 'error';
  const [showSources, setShowSources] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<NotebookSource | null>(null);
  const [selectedIndex, setSelectedIndex] = useState('');

  const handleCitationPress = useCallback((citation: NotebookSource, index: string) => {
    setSelectedCitation(citation);
    setSelectedIndex(index);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedCitation(null);
    setSelectedIndex('');
  }, []);

  const hasSources = message.sources && message.sources.length > 0;

  const documentGroups = useMemo(() => {
    if (!hasSources) return [];
    // Use citations if available (have index + cited_text), fall back to sources
    const citationsWithText = message.citations?.filter((c) => c.cited_text) || [];
    return groupSourcesByDocument(
      citationsWithText.length > 0 ? citationsWithText : message.sources!
    );
  }, [hasSources, message.citations, message.sources]);

  // Markdown styles for assistant messages
  const markdownStyles = useMemo(
    () => ({
      body: {
        color: theme.text,
        fontSize: 15,
        lineHeight: 22,
      },
      paragraph: {
        marginTop: 0,
        marginBottom: 8,
      },
      heading1: {
        color: theme.text,
        fontSize: 18,
        fontWeight: '700' as const,
        marginBottom: 8,
        marginTop: 12,
      },
      heading2: {
        color: theme.text,
        fontSize: 16,
        fontWeight: '600' as const,
        marginBottom: 6,
        marginTop: 10,
      },
      heading3: {
        color: theme.text,
        fontSize: 15,
        fontWeight: '600' as const,
        marginBottom: 4,
        marginTop: 8,
      },
      strong: {
        fontWeight: '600' as const,
      },
      em: {
        fontStyle: 'italic' as const,
      },
      bullet_list: {
        marginBottom: 8,
      },
      ordered_list: {
        marginBottom: 8,
      },
      list_item: {
        flexDirection: 'row' as const,
        marginBottom: 4,
      },
      link: {
        color: colors.primary[600],
        textDecorationLine: 'underline' as const,
      },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: colors.primary[400],
        paddingLeft: 12,
        marginVertical: 8,
        opacity: 0.9,
      },
      code_inline: {
        backgroundColor: colorScheme === 'dark' ? colors.grey[700] : colors.grey[200],
        color: colors.primary[600],
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
        fontSize: 13,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      },
      fence: {
        backgroundColor: colorScheme === 'dark' ? colors.grey[700] : colors.grey[200],
        padding: 12,
        borderRadius: 8,
        marginVertical: 8,
      },
      code_block: {
        fontSize: 13,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      },
    }),
    [theme, colorScheme]
  );

  return (
    <View style={[styles.messageContainer, isUser && styles.messageContainerUser]}>
      <View
        style={[
          styles.messageBubble,
          isUser && styles.messageBubbleUser,
          isError && styles.messageBubbleError,
          {
            backgroundColor: isUser
              ? colors.primary[600]
              : isError
                ? colors.error[100]
                : theme.surface,
            borderColor: isUser ? colors.primary[600] : isError ? colors.error[300] : theme.border,
          },
        ]}
      >
        {message.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary[600]} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Suche in den Quellen...
            </Text>
          </View>
        ) : isUser ? (
          <Text style={[styles.messageText, { color: colors.white }]}>{message.content}</Text>
        ) : isError ? (
          <Text style={[styles.messageText, { color: colors.error[700] }]}>{message.content}</Text>
        ) : (
          <CitationTextRenderer
            text={message.content}
            citations={message.citations || message.sources}
            markdownStyles={markdownStyles}
          />
        )}
      </View>

      {hasSources && !message.isLoading && (
        <View style={styles.sourcesSection}>
          <Pressable style={styles.sourcesToggle} onPress={() => setShowSources(!showSources)}>
            <Ionicons
              name={showSources ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={theme.textSecondary}
            />
            <Text style={[styles.sourcesToggleText, { color: theme.textSecondary }]}>
              {documentGroups.length} {documentGroups.length === 1 ? 'Quelle' : 'Quellen'}
            </Text>
          </Pressable>

          {showSources && (
            <View style={styles.sourcesList}>
              {documentGroups.map((group, index) => (
                <DocumentGroupItem
                  key={group.documentId || `group-${index}`}
                  group={group}
                  onCitationPress={handleCitationPress}
                />
              ))}
            </View>
          )}
        </View>
      )}

      <CitationModal
        visible={!!selectedCitation}
        onClose={handleCloseModal}
        citation={selectedCitation}
        citationIndex={selectedIndex}
      />
    </View>
  );
}

function ExampleQuestion({
  question,
  onPress,
}: {
  question: { icon: string; text: string };
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.exampleQuestion,
        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={onPress}
    >
      <Text style={styles.exampleIcon}>{question.icon}</Text>
      <Text style={[styles.exampleText, { color: theme.text }]} numberOfLines={2}>
        {question.text}
      </Text>
    </Pressable>
  );
}

interface NotebookChatProps {
  notebookId: string;
  onBack?: () => void;
}

export function NotebookChat({ notebookId, onBack }: NotebookChatProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  const { messages, isLoading, sendMessage, config } = useNotebookChat({
    notebookId,
  });

  const [inputText, setInputText] = useState('');
  const { isListening, toggle: toggleSpeech } = useSpeechToText();

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;
    const text = inputText;
    setInputText('');
    await sendMessage(text);
  };

  const handleMicPress = () => {
    toggleSpeech((transcript) => {
      setInputText((prev) => appendTranscript(prev, transcript));
    });
  };

  const handleExamplePress = (text: string) => {
    setInputText(text);
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const isEmpty = messages.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {isEmpty ? (
        <View style={[styles.emptyState, { paddingBottom: insets.bottom + 80 }]}>
          {onBack && (
            <Pressable onPress={onBack} style={styles.inlineBack}>
              <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
              <Text style={[styles.inlineBackText, { color: theme.textSecondary }]}>Notebooks</Text>
            </Pressable>
          )}
          <View style={[styles.emptyIconContainer, { backgroundColor: config.color + '15' }]}>
            <Ionicons name="chatbubbles" size={32} color={config.color} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{config.title}</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            {config.placeholder}
          </Text>

          <View style={styles.exampleQuestions}>
            {config.exampleQuestions.map((question, index) => (
              <ExampleQuestion
                key={index}
                question={question}
                onPress={() => handleExamplePress(question.text)}
              />
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          style={styles.flatList}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View
          style={[
            styles.inputWrapper,
            { backgroundColor: theme.background, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View
            style={[
              styles.inputContainer,
              { backgroundColor: colorScheme === 'dark' ? colors.grey[800] : colors.grey[100] },
            ]}
          >
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              placeholder="Nachricht"
              placeholderTextColor={theme.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={2000}
              editable={!isLoading}
            />
            <MicButton
              isListening={isListening}
              onMicPress={handleMicPress}
              hasText={!!inputText.trim()}
              onSubmit={handleSend}
              loading={isLoading}
              size={32}
            />
          </View>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flatList: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.large,
  },
  inlineBack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    position: 'absolute',
    top: spacing.medium,
    left: spacing.medium,
  },
  inlineBackText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.medium,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xsmall,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.large,
  },
  exampleQuestions: {
    width: '100%',
    gap: spacing.small,
  },
  exampleQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    gap: spacing.small,
  },
  exampleIcon: {
    fontSize: 18,
  },
  exampleText: {
    flex: 1,
    fontSize: 14,
  },
  messagesList: {
    padding: spacing.medium,
    paddingBottom: 100,
  },
  messageContainer: {
    marginBottom: spacing.medium,
    alignItems: 'flex-start',
  },
  messageContainerUser: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '95%',
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  messageBubbleUser: {
    borderBottomRightRadius: borderRadius.small,
  },
  messageBubbleError: {
    borderWidth: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  loadingText: {
    fontSize: 14,
  },
  sourcesSection: {
    marginTop: spacing.small,
    width: '100%',
  },
  sourcesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
  },
  sourcesToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sourcesList: {
    gap: spacing.medium,
    marginTop: spacing.xsmall,
  },
  docGroup: {
    borderWidth: 1,
    borderRadius: borderRadius.large,
    padding: spacing.medium,
    gap: spacing.small,
  },
  docGroupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.small,
  },
  docGroupTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  docGroupTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  docGroupCollection: {
    fontSize: 12,
    marginLeft: 22,
    marginTop: 2,
  },
  relevanceBadge: {
    fontSize: 13,
    fontWeight: '600',
  },
  citationExcerpt: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.small,
    padding: spacing.small,
    borderRadius: borderRadius.medium,
  },
  citationExcerptBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  citationExcerptBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
  citationExcerptText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  inputWrapper: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    paddingLeft: spacing.medium,
    paddingRight: 4,
    paddingVertical: 4,
  },
  textInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingVertical: 8,
    fontSize: 16,
    lineHeight: 20,
  },
});
