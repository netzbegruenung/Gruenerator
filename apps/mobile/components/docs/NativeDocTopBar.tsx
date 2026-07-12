import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  Modal,
  Platform,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSpeechToText } from '../../hooks/useSpeechToText';
import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';
import { lightTheme, darkTheme, colors } from '../../theme';

// Only "problem"/in-progress states get a dot. 'connecting' (initial load) and
// 'connected' show nothing — the skeleton covers the load, so a red/amber dot on
// open would just be noise.
const STATUS_COLORS = {
  syncing: '#f59e0b',
  disconnected: '#ef4444',
} as const;

export function NativeDocTopBar() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const titleRef = useRef<TextInput>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const connectionStatus = useDocsEditorBridgeStore((s) => s.connectionStatus);
  const documentTitle = useDocsEditorBridgeStore((s) => s.documentTitle);
  const canEdit = useDocsEditorBridgeStore((s) => s.canEdit);
  const collaborators = useDocsEditorBridgeStore((s) => s.collaborators);
  const dispatchAction = useDocsEditorBridgeStore((s) => s.dispatchAction);
  const toggleFullscreen = useDocsEditorBridgeStore((s) => s.toggleFullscreen);
  const setVersionsOpen = useDocsEditorBridgeStore((s) => s.setVersionsOpen);
  const canUndo = useDocsEditorBridgeStore((s) => s.canUndo);
  const canRedo = useDocsEditorBridgeStore((s) => s.canRedo);
  const suggestionMode = useDocsEditorBridgeStore((s) => s.suggestionMode);
  const suggestionCount = useDocsEditorBridgeStore((s) => s.suggestions.length);
  const setSuggestionsSheetOpen = useDocsEditorBridgeStore((s) => s.setSuggestionsSheetOpen);

  // Änderungsmodus is doc-wide (Word semantics): flipping it syncs to all editors.
  // Enabling opens the review sheet; disabling closes it — mirrors the web coupling.
  const toggleSuggestionMode = () => {
    const next = !suggestionMode;
    dispatchAction({ type: 'set-suggestion-mode', enabled: next });
    setSuggestionsSheetOpen(next);
  };

  // Native dictation: the OS recognizer (final transcript) feeds the editor via
  // the insert-text bridge — the in-editor web mic can't run in the WebView.
  const { isListening, toggle: toggleDictation } = useSpeechToText();
  const handleDictate = () =>
    void toggleDictation((transcript) => dispatchAction({ type: 'insert-text', text: transcript }));

  // Awareness can report multiple connections for one person (e.g. two tabs) and
  // occasionally a partial user object — dedup by id so avatars/counts reflect people.
  const uniqueCollaborators = Array.from(new Map(collaborators.map((c) => [c.id, c])).values());

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
        {/* Dot only while syncing (amber) or after a real disconnect (red).
            'connecting'/'connected' show nothing. */}
        {(connectionStatus === 'syncing' || connectionStatus === 'disconnected') && (
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

      {/* Presence: who else is in the document (from Yjs awareness). */}
      {uniqueCollaborators.length > 0 && (
        <View style={styles.avatarRow}>
          {uniqueCollaborators.slice(0, 3).map((c, i) => (
            <View
              key={c.id}
              style={[
                styles.avatar,
                {
                  backgroundColor: c.color || colors.primary[500],
                  borderColor: theme.background,
                  marginLeft: i === 0 ? 0 : -8,
                },
              ]}
            >
              <Text style={styles.avatarText}>
                {(c.name ?? '').trim().slice(0, 2).toUpperCase() || '?'}
              </Text>
            </View>
          ))}
          {uniqueCollaborators.length > 3 && (
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: colors.grey[400],
                  borderColor: theme.background,
                  marginLeft: -8,
                },
              ]}
            >
              <Text style={styles.avatarText}>+{uniqueCollaborators.length - 3}</Text>
            </View>
          )}
        </View>
      )}

      {canEdit && (
        <>
          <TouchableOpacity
            onPress={() => dispatchAction({ type: 'undo' })}
            disabled={!canUndo}
            style={styles.iconButton}
            accessibilityLabel="Rückgängig"
          >
            <Ionicons
              name="arrow-undo-outline"
              size={22}
              color={canUndo ? theme.text : theme.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => dispatchAction({ type: 'redo' })}
            disabled={!canRedo}
            style={styles.iconButton}
            accessibilityLabel="Wiederholen"
          >
            <Ionicons
              name="arrow-redo-outline"
              size={22}
              color={canRedo ? theme.text : theme.textSecondary}
            />
          </TouchableOpacity>
        </>
      )}

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

      {/* Overflow menu: back (iOS) + share + version history + fullscreen */}
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
            {/* iOS lacks a reliable system back gesture into the tab stack here, so
                expose an explicit "Zurück" item (Android keeps its system back). */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  if (router.canGoBack()) router.back();
                  else router.replace('/(tabs)/(docs)');
                }}
              >
                <Ionicons name="arrow-back" size={20} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Zurück</Text>
              </TouchableOpacity>
            )}
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
            {canEdit && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  toggleSuggestionMode();
                }}
              >
                <Ionicons
                  name={suggestionMode ? 'git-compare' : 'git-compare-outline'}
                  size={20}
                  color={suggestionMode ? colors.primary[600] : theme.text}
                />
                <Text
                  style={[
                    styles.menuItemText,
                    { color: suggestionMode ? colors.primary[600] : theme.text },
                  ]}
                >
                  Änderungen nachverfolgen (Experimentell)
                </Text>
                {suggestionMode && (
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={colors.primary[600]}
                    style={styles.menuItemTrailing}
                  />
                )}
              </TouchableOpacity>
            )}
            {canEdit && suggestionMode && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  setSuggestionsSheetOpen(true);
                }}
              >
                <Ionicons name="list-outline" size={20} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>
                  Änderungen prüfen{suggestionCount > 0 ? ` (${suggestionCount})` : ''}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                setVersionsOpen(true);
              }}
            >
              <Ionicons name="time-outline" size={20} color={theme.text} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>Versionsverlauf</Text>
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
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
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
    maxWidth: 300,
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
    flexShrink: 1,
  },
  menuItemTrailing: {
    marginLeft: 'auto',
  },
});
