import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSpeechToText } from '../../hooks/useSpeechToText';
import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';
import { lightTheme, darkTheme, colors } from '../../theme';

const STATUS_COLORS = {
  connected: '#22c55e',
  syncing: '#f59e0b',
  disconnected: '#ef4444',
} as const;

export function NativeDocTopBar() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const titleRef = useRef<TextInput>(null);

  const connectionStatus = useDocsEditorBridgeStore((s) => s.connectionStatus);
  const documentTitle = useDocsEditorBridgeStore((s) => s.documentTitle);
  const canEdit = useDocsEditorBridgeStore((s) => s.canEdit);
  const dispatchAction = useDocsEditorBridgeStore((s) => s.dispatchAction);
  const toggleSidebar = useDocsEditorBridgeStore((s) => s.toggleSidebar);

  // Native dictation: the OS recognizer (final transcript) feeds the editor via
  // the insert-text bridge — the in-editor web mic can't run in the WebView.
  const { isListening, toggle: toggleDictation } = useSpeechToText();
  const handleDictate = () =>
    void toggleDictation((transcript) => dispatchAction({ type: 'insert-text', text: transcript }));

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
      <View style={styles.titleRow}>
        {/* Problem-only indicator: green "connected" is noise, so the dot shows
            only while syncing (amber) or disconnected (red). */}
        {connectionStatus !== 'connected' && (
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[connectionStatus] }]} />
        )}
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

      {canEdit && (
        <TouchableOpacity
          onPress={handleDictate}
          style={styles.iconButton}
          accessibilityLabel={isListening ? 'Diktat stoppen' : 'Diktieren'}
        >
          <Ionicons
            name={isListening ? 'stop-circle' : 'mic-outline'}
            size={22}
            color={isListening ? colors.error[500] : theme.text}
          />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={toggleSidebar}
        style={styles.iconButton}
        accessibilityLabel="KI-Assistent"
      >
        <Ionicons name="sparkles-outline" size={22} color={theme.text} />
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
});
