import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  useColorScheme,
  Pressable,
  Text,
  ScrollView,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { GiftedChat, IMessage } from 'react-native-gifted-chat';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import {
  useGeneratedTextStore,
  useTextEditActions,
  extractEditableText,
  type ChatMessage,
  type EditChange,
} from '@gruenerator/shared/generators';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import {
  FloatingGlassMenu,
  createChatRenderers,
  ASSISTANT_USER,
  CURRENT_USER,
} from '../../components/chat';
import { getErrorMessage } from '../../utils/errors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { API_ENDPOINTS } from '../../services/api';

interface ExpandableTextPreviewProps {
  text: string;
  theme: typeof lightTheme | typeof darkTheme;
}

function ExpandableTextPreview({ text, theme }: ExpandableTextPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <Pressable
      onPress={toggleExpanded}
      style={[styles.textPreview, { backgroundColor: theme.surface }]}
    >
      <ScrollView
        style={{ maxHeight: expanded ? 300 : 120 }}
        scrollEnabled={expanded}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[styles.previewText, { color: theme.text }]}
          numberOfLines={expanded ? undefined : 5}
        >
          {text || 'Kein Text vorhanden'}
        </Text>
      </ScrollView>
      <View style={styles.expandIndicator}>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.textSecondary}
        />
      </View>
    </Pressable>
  );
}

interface SuggestEditsResponse {
  changes?: EditChange[];
  summary?: string;
  needsFrontendParsing?: boolean;
  raw?: string;
}

export default function EditChatModal() {
  const { componentName } = useLocalSearchParams<{ componentName: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const storeContent = useGeneratedTextStore((state) =>
    componentName ? state.generatedTexts[componentName] || '' : ''
  );
  const canUndo = useGeneratedTextStore((state) =>
    componentName ? state.canUndo(componentName) : false
  );
  const canRedo = useGeneratedTextStore((state) =>
    componentName ? state.canRedo(componentName) : false
  );
  const undo = useGeneratedTextStore((state) => state.undo);
  const redo = useGeneratedTextStore((state) => state.redo);
  const getEditChat = useGeneratedTextStore((state) => state.getEditChat);
  const setEditChat = useGeneratedTextStore((state) => state.setEditChat);

  const { getEditableText, applyEdits } = useTextEditActions(componentName || '');

  const currentText = useMemo(() => extractEditableText(storeContent), [storeContent]);

  useEffect(() => {
    if (!componentName) return;

    const existingChat = getEditChat(componentName);
    if (existingChat.length > 0) {
      const giftedMessages: IMessage[] = existingChat.map((msg, index) => ({
        _id: msg.timestamp || index,
        text: msg.content,
        createdAt: new Date(msg.timestamp || Date.now()),
        user: msg.type === 'user' ? CURRENT_USER : ASSISTANT_USER,
        system: msg.type === 'error',
      }));
      setMessages(giftedMessages);
    } else {
      setMessages([
        {
          _id: Date.now(),
          text: 'Beschreibe kurz, was wir am Text verbessern sollen. Ich mache Vorschläge und wende sie direkt an. ✨',
          createdAt: new Date(),
          user: ASSISTANT_USER,
        },
      ]);
    }
  }, [componentName, getEditChat]);

  useEffect(() => {
    if (!componentName || messages.length === 0) return;

    const chatMessages: ChatMessage[] = messages.map((msg) => ({
      type: msg.user._id === CURRENT_USER._id ? 'user' : msg.system ? 'error' : 'assistant',
      content: msg.text,
      timestamp: new Date(msg.createdAt).getTime(),
    }));

    setEditChat(componentName, chatMessages);
  }, [messages, componentName, setEditChat]);

  const attemptFrontendParsing = useCallback(
    (rawData: SuggestEditsResponse): EditChange[] | null => {
      if (!rawData?.raw) return null;

      try {
        let cleaned = rawData.raw
          .replace(/```json\s*|\s*```/g, '')
          .replace(/(\*\*|__|~~)\s*"/g, '"')
          .replace(/"\s*(\*\*|__|~~)/g, '"')
          .trim();

        const parsed = JSON.parse(cleaned);
        if (parsed.changes && Array.isArray(parsed.changes)) {
          return parsed.changes;
        }
      } catch {
        console.warn('[EditChat] Frontend parsing failed');
      }
      return null;
    },
    []
  );

  const onSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      if (!componentName || !newMessages.length) return;

      const userMessage = newMessages[0];
      const instruction = userMessage.text.trim();
      if (!instruction) return;

      setMessages((prev) => [...prev, ...newMessages]);
      setIsTyping(true);

      const textBeforeEdit = getEditableText();
      if (!textBeforeEdit) {
        const errorMessage: IMessage = {
          _id: Date.now(),
          text: 'Kein Text vorhanden, den ich verbessern kann.',
          createdAt: new Date(),
          user: ASSISTANT_USER,
          system: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsTyping(false);
        return;
      }

      try {
        const client = getGlobalApiClient();
        const response = await client.post<SuggestEditsResponse>(API_ENDPOINTS.SUGGEST_EDITS, {
          instruction,
          currentText: textBeforeEdit,
          componentName,
        });

        let data = response?.data;
        if (data?.needsFrontendParsing) {
          const frontendParsed = attemptFrontendParsing(data);
          if (frontendParsed) {
            data = { ...data, changes: frontendParsed };
          }
        }

        const changes = data?.changes || [];

        if (!Array.isArray(changes) || changes.length === 0) {
          const noChangesMessage: IMessage = {
            _id: Date.now(),
            text: 'Keine konkreten Änderungen vorgeschlagen. Präzisiere gern, was verändert werden soll.',
            createdAt: new Date(),
            user: ASSISTANT_USER,
          };
          setMessages((prev) => [...prev, noChangesMessage]);
        } else {
          const result = applyEdits(changes);

          if (result.appliedCount === 0) {
            const errorMessage: IMessage = {
              _id: Date.now(),
              text: 'Die Änderungen konnten nicht angewendet werden. Der Text wurde möglicherweise bereits verändert.',
              createdAt: new Date(),
              user: ASSISTANT_USER,
              system: true,
            };
            setMessages((prev) => [...prev, errorMessage]);
          } else {
            let summary = data?.summary;
            if (!summary) {
              const isFullReplace = changes.length === 1 && changes[0].full_replace === true;
              if (isFullReplace) {
                summary = '✅ Text komplett umgeschrieben!';
              } else {
                summary = `✅ ${result.appliedCount} ${result.appliedCount === 1 ? 'Änderung' : 'Änderungen'} angewendet.`;
              }
            }

            const successMessage: IMessage = {
              _id: Date.now(),
              text: summary,
              createdAt: new Date(),
              user: ASSISTANT_USER,
            };
            setMessages((prev) => [...prev, successMessage]);
          }
        }
      } catch (error: unknown) {
        const errorMessage: IMessage = {
          _id: Date.now(),
          text: getErrorMessage(error),
          createdAt: new Date(),
          user: ASSISTANT_USER,
          system: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsTyping(false);
      }
    },
    [componentName, getEditableText, applyEdits, attemptFrontendParsing]
  );

  const handleUndo = useCallback(() => {
    if (componentName && canUndo) {
      undo(componentName);
    }
  }, [componentName, canUndo, undo]);

  const handleRedo = useCallback(() => {
    if (componentName && canRedo) {
      redo(componentName);
    }
  }, [componentName, canRedo, redo]);

  const chatRenderers = useMemo(() => createChatRenderers(theme), [theme]);

  if (!componentName) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>Fehler: Kein Komponentenname angegeben</Text>
      </View>
    );
  }

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <FloatingGlassMenu>
        <Pressable
          onPress={handleUndo}
          disabled={!canUndo}
          style={({ pressed }) => [
            styles.floatingButton,
            { opacity: canUndo ? (pressed ? 0.7 : 1) : 0.3 },
          ]}
        >
          <Ionicons name="arrow-undo" size={20} color={theme.text} />
        </Pressable>
        <Pressable
          onPress={handleRedo}
          disabled={!canRedo}
          style={({ pressed }) => [
            styles.floatingButton,
            { opacity: canRedo ? (pressed ? 0.7 : 1) : 0.3 },
          ]}
        >
          <Ionicons name="arrow-redo" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.floatingDivider} />
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.floatingButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="checkmark" size={22} color={colors.primary[600]} />
        </Pressable>
      </FloatingGlassMenu>

      <View style={styles.contentContainer}>
        <ExpandableTextPreview text={currentText} theme={theme} />

        <GiftedChat
          messages={messages}
          onSend={(msgs: IMessage[]) => onSend(msgs)}
          user={CURRENT_USER}
          isTyping={isTyping}
          inverted={false}
          alwaysShowSend
          {...chatRenderers}
          minInputToolbarHeight={60}
          bottomOffset={0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    marginTop: spacing.xlarge + spacing.medium,
    paddingBottom: spacing.large,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingButton: {
    padding: spacing.xsmall,
  },
  floatingDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
    marginHorizontal: spacing.xxsmall,
  },
  textPreview: {
    marginHorizontal: spacing.medium,
    marginBottom: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  expandIndicator: {
    alignItems: 'center',
    paddingTop: spacing.xsmall,
  },
  previewText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
