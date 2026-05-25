import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  Modal,
  StyleSheet,
  useColorScheme,
} from 'react-native';
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
  const [menuOpen, setMenuOpen] = useState(false);

  const connectionStatus = useDocsEditorBridgeStore((s) => s.connectionStatus);
  const documentTitle = useDocsEditorBridgeStore((s) => s.documentTitle);
  const canEdit = useDocsEditorBridgeStore((s) => s.canEdit);
  const dispatchAction = useDocsEditorBridgeStore((s) => s.dispatchAction);
  const toggleFullscreen = useDocsEditorBridgeStore((s) => s.toggleFullscreen);

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
        onPress={() => setMenuOpen(true)}
        style={styles.iconButton}
        accessibilityLabel="Mehr"
      >
        <Ionicons name="ellipsis-vertical" size={22} color={theme.text} />
      </TouchableOpacity>

      {/* Overflow menu: share + fullscreen */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View
            style={[
              styles.menuCard,
              { top: insets.top + 44, backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                dispatchAction({ type: 'openShare' });
              }}
            >
              <Ionicons name="share-social-outline" size={20} color={theme.text} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>Teilen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                toggleFullscreen();
              }}
            >
              <Ionicons name="expand-outline" size={20} color={theme.text} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>Vollbild</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
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
  menuBackdrop: {
    flex: 1,
  },
  menuCard: {
    position: 'absolute',
    right: 8,
    minWidth: 180,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
