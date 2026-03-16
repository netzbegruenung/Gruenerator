import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lightTheme, darkTheme, colors } from '../../theme/colors';
import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';

const STATUS_COLORS = {
  connected: '#22c55e',
  syncing: '#f59e0b',
  disconnected: '#ef4444',
} as const;

export function NativeDocTopBar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const titleRef = useRef<TextInput>(null);

  const connectionStatus = useDocsEditorBridgeStore((s) => s.connectionStatus);
  const documentTitle = useDocsEditorBridgeStore((s) => s.documentTitle);
  const canEdit = useDocsEditorBridgeStore((s) => s.canEdit);
  const chatMessageCount = useDocsEditorBridgeStore((s) => s.chatMessages.length);
  const lastSeenMessageCount = useDocsEditorBridgeStore((s) => s.lastSeenMessageCount);
  const dispatchAction = useDocsEditorBridgeStore((s) => s.dispatchAction);
  const toggleSidebar = useDocsEditorBridgeStore((s) => s.toggleSidebar);

  const unreadCount = chatMessageCount - lastSeenMessageCount;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 4,
          backgroundColor: theme.background,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.iconButton}
        accessibilityLabel="Zurück"
      >
        <Ionicons name="arrow-back" size={24} color={theme.text} />
      </TouchableOpacity>

      <View style={styles.titleRow}>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[connectionStatus] }]} />
        <TextInput
          ref={titleRef}
          style={[styles.titleInput, { color: theme.text }]}
          defaultValue={documentTitle}
          editable={canEdit}
          placeholder="Dokumenttitel"
          placeholderTextColor={theme.textSecondary}
          onEndEditing={(e) => {
            const newTitle = e.nativeEvent.text.trim();
            if (newTitle && newTitle !== documentTitle) {
              dispatchAction({ type: 'titleChange', title: newTitle });
            }
          }}
          returnKeyType="done"
        />
      </View>

      <TouchableOpacity onPress={toggleSidebar} style={styles.iconButton} accessibilityLabel="Chat">
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.text} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => dispatchAction({ type: 'openShare' })}
        style={styles.iconButton}
        accessibilityLabel="Teilen"
      >
        <Ionicons name="share-social-outline" size={22} color={theme.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  titleInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 4,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
});
