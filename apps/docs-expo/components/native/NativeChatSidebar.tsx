import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDocsEditorBridgeStore, type ChatMessage } from '../../stores/docsEditorBridgeStore';
import { lightTheme, darkTheme, colors } from '../../theme/colors';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return 'Gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (hours < 24) return `vor ${hours} Std.`;

  return new Date(timestamp).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MessageBubble({
  message,
  isOwn,
  isDark,
}: {
  message: ChatMessage;
  isOwn: boolean;
  isDark: boolean;
}) {
  return (
    <View style={[msgStyles.row, isOwn && msgStyles.rowReverse]}>
      <View style={[msgStyles.avatar, { backgroundColor: message.userColor }]}>
        <Text style={msgStyles.avatarText}>{getInitials(message.userName)}</Text>
      </View>
      <View style={[msgStyles.content, isOwn && msgStyles.contentReverse]}>
        <View style={[msgStyles.metaRow, isOwn && msgStyles.metaRowReverse]}>
          <Text style={[msgStyles.userName, isDark && msgStyles.textLight]} numberOfLines={1}>
            {message.userName}
          </Text>
          <Text style={msgStyles.timestamp}>{formatRelativeTime(message.timestamp)}</Text>
        </View>
        <View
          style={[
            msgStyles.bubble,
            isOwn
              ? { backgroundColor: isDark ? '#3A5448' : '#D5E1DC', alignSelf: 'flex-end' }
              : { backgroundColor: isDark ? '#1f2937' : '#f3f4f6', alignSelf: 'flex-start' },
          ]}
        >
          <Text style={[msgStyles.messageText, isDark && msgStyles.textLight]}>{message.text}</Text>
        </View>
      </View>
    </View>
  );
}

export function NativeChatSidebar() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const sidebarOpen = useDocsEditorBridgeStore((s) => s.sidebarOpen);
  const chatMessages = useDocsEditorBridgeStore((s) => s.chatMessages);
  const localUserId = useDocsEditorBridgeStore((s) => s.localUserId);
  const typingUsers = useDocsEditorBridgeStore((s) => s.typingUsers);
  const toggleSidebar = useDocsEditorBridgeStore((s) => s.toggleSidebar);
  const markChatRead = useDocsEditorBridgeStore((s) => s.markChatRead);
  const dispatchAction = useDocsEditorBridgeStore((s) => s.dispatchAction);

  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mark messages as read when sidebar opens
  useEffect(() => {
    if (sidebarOpen) markChatRead();
  }, [sidebarOpen, markChatRead]);

  // Also mark read when new messages arrive while sidebar is open
  useEffect(() => {
    if (sidebarOpen && chatMessages.length > 0) markChatRead();
  }, [sidebarOpen, chatMessages.length, markChatRead]);

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value);
      dispatchAction({ type: 'set-typing', isTyping: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        dispatchAction({ type: 'set-typing', isTyping: false });
      }, 3000);
    },
    [dispatchAction]
  );

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    dispatchAction({ type: 'send-chat', text: trimmed });
    dispatchAction({ type: 'set-typing', isTyping: false });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setText('');
    inputRef.current?.clear();
  };

  return (
    <Modal visible={sidebarOpen} animationType="slide" onRequestClose={toggleSidebar}>
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 8,
              backgroundColor: theme.background,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <TouchableOpacity
            onPress={toggleSidebar}
            style={styles.closeButton}
            accessibilityLabel="Chat schlie\u00dfen"
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Chat</Text>
          <View style={styles.closeButton} />
        </View>

        {/* Messages */}
        {chatMessages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubble-outline" size={32} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Noch keine Nachrichten
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatMessages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble message={item} isOwn={item.userId === localUserId} isDark={isDark} />
            )}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <View style={styles.typingBar}>
            <Text style={[styles.typingText, { color: theme.textSecondary }]}>
              {typingUsers.length === 1
                ? `${typingUsers[0]} tippt...`
                : `${typingUsers.join(' und ')} tippen...`}
            </Text>
          </View>
        )}

        {/* Composer */}
        <View
          style={[
            styles.composer,
            {
              paddingBottom: insets.bottom || 12,
              backgroundColor: theme.background,
              borderTopColor: theme.border,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
              },
            ]}
            placeholder="Nachricht..."
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={2000}
            onChangeText={handleTextChange}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim()}
            style={[
              styles.sendButton,
              {
                backgroundColor: text.trim() ? colors.primary[600] : isDark ? '#374151' : '#e5e7eb',
              },
            ]}
            accessibilityLabel="Senden"
          >
            <Ionicons name="send" size={18} color={text.trim() ? 'white' : theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
  },
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
});

const msgStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  contentReverse: {
    alignItems: 'flex-end',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  metaRowReverse: {
    flexDirection: 'row-reverse',
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  timestamp: {
    fontSize: 11,
    color: '#9ca3af',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: '85%',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  textLight: {
    color: '#e5e7eb',
  },
});
