import { useState, useRef, useEffect, useMemo } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { colors, spacing, lightTheme, darkTheme, borderRadius } from '../../theme';
import { useNotebookChat } from '../../hooks/useNotebookChat';
import { CitationTextRenderer } from './CitationTextRenderer';
import type { NotebookChatMessage, NotebookSource } from '../../stores/notebookChatStore';

function SourceItem({ source }: { source: NotebookSource }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const handlePress = () => {
    if (source.url) {
      Linking.openURL(source.url);
    }
  };

  return (
    <Pressable
      style={[styles.sourceItem, { backgroundColor: theme.background, borderColor: theme.border }]}
      onPress={handlePress}
      disabled={!source.url}
    >
      <Ionicons
        name={source.url ? 'link-outline' : 'document-outline'}
        size={14}
        color={colors.primary[600]}
      />
      <Text style={[styles.sourceTitle, { color: theme.text }]} numberOfLines={1}>
        {source.title}
      </Text>
      {source.collectionName && (
        <Text style={[styles.sourceCollection, { color: theme.textSecondary }]} numberOfLines={1}>
          {source.collectionName}
        </Text>
      )}
    </Pressable>
  );
}

function MessageBubble({ message }: { message: NotebookChatMessage }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isUser = message.type === 'user';
  const isError = message.type === 'error';
  const [showSources, setShowSources] = useState(false);

  const hasSources = message.sources && message.sources.length > 0;

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
              {message.sources!.length} Quellen
            </Text>
          </Pressable>

          {showSources && (
            <View style={styles.sourcesList}>
              {message.sources!.slice(0, 5).map((source, index) => (
                <SourceItem key={`${source.title}-${index}`} source={source} />
              ))}
              {message.sources!.length > 5 && (
                <Text style={[styles.moreSourcesText, { color: theme.textSecondary }]}>
                  +{message.sources!.length - 5} weitere Quellen
                </Text>
              )}
            </View>
          )}
        </View>
      )}
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
}

export function NotebookChat({ notebookId }: NotebookChatProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  const { messages, isLoading, sendMessage, config } = useNotebookChat({
    notebookId,
  });

  const [inputText, setInputText] = useState('');

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;
    const text = inputText;
    setInputText('');
    await sendMessage(text);
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
        <View style={styles.emptyState}>
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
            {
              backgroundColor: theme.background,
              paddingBottom: Math.max(insets.bottom, spacing.small),
            },
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
            <Pressable
              style={[
                styles.sendButton,
                {
                  backgroundColor:
                    inputText.trim() && !isLoading ? colors.primary[600] : 'transparent',
                },
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary[600]} />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={20}
                  color={inputText.trim() ? colors.white : theme.textSecondary}
                />
              )}
            </Pressable>
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
    paddingBottom: spacing.large,
  },
  messageContainer: {
    marginBottom: spacing.medium,
    alignItems: 'flex-start',
  },
  messageContainerUser: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '85%',
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
    marginTop: spacing.xsmall,
    maxWidth: '85%',
  },
  sourcesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.xsmall,
  },
  sourcesToggleText: {
    fontSize: 12,
    fontWeight: '500',
  },
  sourcesList: {
    gap: spacing.xsmall,
    marginTop: spacing.xsmall,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.small,
    borderRadius: borderRadius.small,
    borderWidth: 1,
    gap: spacing.xsmall,
  },
  sourceTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  sourceCollection: {
    fontSize: 11,
  },
  moreSourcesText: {
    fontSize: 12,
    paddingVertical: spacing.xsmall,
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
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
