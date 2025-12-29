import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, useColorScheme, Pressable, Text, Alert } from 'react-native';
import { GiftedChat, IMessage, Bubble, InputToolbar, Composer, Send } from 'react-native-gifted-chat';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import {
  useGeneratedTextStore,
  useTextEditActions,
  extractEditableText,
  type ChatMessage,
  type EditChange,
} from '@gruenerator/shared/generators';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import { API_ENDPOINTS } from '../../services/api';

const ASSISTANT_USER = {
  _id: 2,
  name: 'Grünerator',
  avatar: require('../../assets/icon.png'),
};

const CURRENT_USER = {
  _id: 1,
  name: 'Du',
};

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
      const giftedMessages: IMessage[] = existingChat
        .map((msg, index) => ({
          _id: msg.timestamp || index,
          text: msg.content,
          createdAt: new Date(msg.timestamp || Date.now()),
          user: msg.type === 'user' ? CURRENT_USER : ASSISTANT_USER,
          system: msg.type === 'error',
        }))
        .reverse();
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

    const chatMessages: ChatMessage[] = messages
      .slice()
      .reverse()
      .map((msg) => ({
        type: msg.user._id === CURRENT_USER._id ? 'user' : msg.system ? 'error' : 'assistant',
        content: msg.text,
        timestamp: new Date(msg.createdAt).getTime(),
      }));

    setEditChat(componentName, chatMessages);
  }, [messages, componentName, setEditChat]);

  const attemptFrontendParsing = useCallback((rawData: SuggestEditsResponse): EditChange[] | null => {
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
  }, []);

  const onSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      if (!componentName || !newMessages.length) return;

      const userMessage = newMessages[0];
      const instruction = userMessage.text.trim();
      if (!instruction) return;

      setMessages((prev) => GiftedChat.append(prev, newMessages));
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
        setMessages((prev) => GiftedChat.append(prev, [errorMessage]));
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
          setMessages((prev) => GiftedChat.append(prev, [noChangesMessage]));
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
            setMessages((prev) => GiftedChat.append(prev, [errorMessage]));
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
            setMessages((prev) => GiftedChat.append(prev, [successMessage]));
          }
        }
      } catch (error) {
        const errText = error instanceof Error ? error.message : 'Fehler bei der Verarbeitung';
        const errorMessage: IMessage = {
          _id: Date.now(),
          text: errText,
          createdAt: new Date(),
          user: ASSISTANT_USER,
          system: true,
        };
        setMessages((prev) => GiftedChat.append(prev, [errorMessage]));
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

  const renderBubble = useCallback(
    (props: any) => (
      <Bubble
        {...props}
        wrapperStyle={{
          right: {
            backgroundColor: colors.primary[600],
            borderRadius: borderRadius.large,
            marginVertical: spacing.xxsmall,
          },
          left: {
            backgroundColor: theme.surface,
            borderRadius: borderRadius.large,
            marginVertical: spacing.xxsmall,
          },
        }}
        textStyle={{
          right: {
            color: colors.white,
          },
          left: {
            color: theme.text,
          },
        }}
      />
    ),
    [theme]
  );

  const renderInputToolbar = useCallback(
    (props: any) => (
      <InputToolbar
        {...props}
        containerStyle={[
          styles.inputToolbar,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.border,
          },
        ]}
      />
    ),
    [theme]
  );

  const renderComposer = useCallback(
    (props: any) => (
      <Composer
        {...props}
        textInputStyle={[
          styles.composer,
          {
            color: theme.text,
            backgroundColor: theme.surface,
          },
        ]}
        placeholderTextColor={theme.textSecondary}
      />
    ),
    [theme]
  );

  const renderSend = useCallback(
    (props: any) => (
      <Send {...props} containerStyle={styles.sendContainer}>
        <View style={[styles.sendButton, { backgroundColor: colors.primary[600] }]}>
          <Ionicons name="send" size={18} color={colors.white} />
        </View>
      </Send>
    ),
    []
  );

  if (!componentName) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>Fehler: Kein Komponentenname angegeben</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Text bearbeiten',
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable
                onPress={handleUndo}
                disabled={!canUndo}
                style={({ pressed }) => [
                  styles.headerButton,
                  { opacity: canUndo ? (pressed ? 0.7 : 1) : 0.3 },
                ]}
              >
                <Ionicons name="arrow-undo" size={22} color={colors.primary[600]} />
              </Pressable>
              <Pressable
                onPress={handleRedo}
                disabled={!canRedo}
                style={({ pressed }) => [
                  styles.headerButton,
                  { opacity: canRedo ? (pressed ? 0.7 : 1) : 0.3 },
                ]}
              >
                <Ionicons name="arrow-redo" size={22} color={colors.primary[600]} />
              </Pressable>
            </View>
          ),
        }}
      />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.textPreview, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>Aktueller Text:</Text>
          <Text style={[styles.previewText, { color: theme.text }]} numberOfLines={3}>
            {currentText || 'Kein Text vorhanden'}
          </Text>
        </View>

        {/* @ts-expect-error - GiftedChat typing issues with React 19 */}
        <GiftedChat
          messages={messages}
          onSend={(msgs: IMessage[]) => onSend(msgs)}
          user={CURRENT_USER}
          isTyping={isTyping}
          alwaysShowSend
          renderBubble={renderBubble}
          renderInputToolbar={renderInputToolbar}
          renderComposer={renderComposer}
          renderSend={renderSend}
          minInputToolbarHeight={60}
          bottomOffset={0}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.xsmall,
  },
  headerButton: {
    padding: spacing.xsmall,
  },
  textPreview: {
    margin: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: spacing.xxsmall,
  },
  previewText: {
    fontSize: 14,
    lineHeight: 20,
  },
  inputToolbar: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  composer: {
    borderRadius: borderRadius.large,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    fontSize: 16,
    marginRight: spacing.xsmall,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.xsmall,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
