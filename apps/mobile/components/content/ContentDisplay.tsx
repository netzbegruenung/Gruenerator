import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Share,
  Pressable,
  Modal,
  TouchableWithoutFeedback,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState, useCallback } from 'react';
import Markdown from 'react-native-markdown-display';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useGeneratedTextStore, extractEditableText } from '@gruenerator/shared/generators';
import { colors, typography, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import { secureStorage } from '../../services/storage';
import { routeWithParams } from '../../types/routes';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

interface ContentDisplayProps {
  componentName: string;
  onNewGeneration: () => void;
}

export function ContentDisplay({ componentName, onNewGeneration }: ContentDisplayProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [copied, setCopied] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const content = useGeneratedTextStore((state) => state.generatedTexts[componentName] || '');
  const canUndo = useGeneratedTextStore((state) => state.canUndo(componentName));
  const canRedo = useGeneratedTextStore((state) => state.canRedo(componentName));
  const undo = useGeneratedTextStore((state) => state.undo);
  const redo = useGeneratedTextStore((state) => state.redo);

  const text = extractEditableText(content);
  const hasContent = text.trim().length > 0;

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  const handleShare = useCallback(async () => {
    setMenuVisible(false);
    try {
      await Share.share({ message: text });
    } catch (error) {
      console.error('[Share] Error:', error);
    }
  }, [text]);

  const openMenu = useCallback(() => {
    setMenuVisible(true);
  }, []);

  const handleMenuCopy = useCallback(async () => {
    setMenuVisible(false);
    await handleCopy();
  }, [handleCopy]);

  const handleEdit = useCallback(() => {
    router.push(routeWithParams('/(modals)/edit-chat', { componentName }));
  }, [router, componentName]);

  const handleUndo = useCallback(() => {
    undo(componentName);
  }, [undo, componentName]);

  const handleRedo = useCallback(() => {
    redo(componentName);
  }, [redo, componentName]);

  const handleDOCXDownload = useCallback(async () => {
    setMenuVisible(false);
    try {
      const token = await secureStorage.getToken();
      const filename = `gruenerator_${Date.now()}.docx`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      const response = await fetch(`${API_BASE_URL}/exports/docx`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: text, title: 'Grünerator Text' }),
      });

      if (!response.ok) {
        throw new Error('Download fehlgeschlagen');
      }

      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        dialogTitle: 'Word-Datei teilen',
      });

      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    } catch (error) {
      console.error('[DOCX Download] Error:', error);
      Alert.alert('Fehler', 'Word-Export fehlgeschlagen. Bitte versuche es erneut.');
    }
  }, [text]);

  const markdownStyles = StyleSheet.create({
    body: {
      color: theme.text,
      fontSize: 16,
      lineHeight: 24,
    },
    heading1: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '700',
      marginBottom: spacing.small,
    },
    heading2: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '600',
      marginBottom: spacing.xsmall,
    },
    heading3: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '600',
      marginBottom: spacing.xsmall,
    },
    paragraph: {
      color: theme.text,
      marginBottom: spacing.small,
    },
    strong: {
      fontWeight: '700',
    },
    em: {
      fontStyle: 'italic',
    },
    bullet_list: {
      marginBottom: spacing.small,
    },
    ordered_list: {
      marginBottom: spacing.small,
    },
    list_item: {
      flexDirection: 'row',
      marginBottom: spacing.xxsmall,
    },
    blockquote: {
      borderLeftWidth: 4,
      borderLeftColor: colors.primary[500],
      paddingLeft: spacing.medium,
      marginVertical: spacing.small,
      backgroundColor: theme.surface,
      borderRadius: borderRadius.small,
      paddingVertical: spacing.xsmall,
    },
    code_inline: {
      backgroundColor: theme.surface,
      color: colors.primary[600],
      paddingHorizontal: 4,
      borderRadius: 4,
      fontFamily: 'monospace',
    },
    fence: {
      backgroundColor: theme.surface,
      padding: spacing.medium,
      borderRadius: borderRadius.medium,
      marginVertical: spacing.small,
    },
    link: {
      color: theme.link,
    },
  });

  if (!hasContent) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.surface }]}>
        <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Noch kein Text grüneriert
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Markdown style={markdownStyles}>{text}</Markdown>
      </ScrollView>

      {Platform.OS === 'ios' && isLiquidGlassAvailable() ? (
        <GlassView style={[styles.fab, { bottom: insets.bottom + 16 }]}>
          <Pressable onPress={openMenu} style={styles.fabPressable}>
            <Ionicons name="pencil" size={24} color={colors.primary[600]} />
          </Pressable>
        </GlassView>
      ) : (
        <BlurView
          intensity={80}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={[
            styles.fab,
            styles.fabBlur,
            {
              bottom: insets.bottom + 16,
              backgroundColor:
                colorScheme === 'dark' ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.75)',
            },
          ]}
        >
          <Pressable onPress={openMenu} style={styles.fabPressable}>
            <Ionicons name="pencil" size={24} color={colors.primary[600]} />
          </Pressable>
        </BlurView>
      )}

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={styles.menuOverlay}>
            <View
              style={[
                styles.menuContainer,
                { backgroundColor: theme.card, bottom: insets.bottom + 80, right: spacing.medium },
              ]}
            >
              <Pressable
                onPress={() => {
                  setMenuVisible(false);
                  handleEdit();
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  styles.menuItemPrimary,
                  { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
                ]}
              >
                <Ionicons name="chatbubble-outline" size={18} color={colors.white} />
                <Text style={[styles.menuItemText, { color: colors.white, fontWeight: '500' }]}>
                  Bearbeiten
                </Text>
              </Pressable>
              <Pressable
                onPress={handleMenuCopy}
                style={({ pressed }) => [
                  styles.menuItem,
                  { backgroundColor: pressed ? theme.surface : 'transparent' },
                ]}
              >
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={copied ? colors.primary[600] : theme.text}
                />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Kopieren</Text>
              </Pressable>
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [
                  styles.menuItem,
                  { backgroundColor: pressed ? theme.surface : 'transparent' },
                ]}
              >
                <Ionicons name="share-outline" size={18} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Teilen</Text>
              </Pressable>
              <Pressable
                onPress={handleDOCXDownload}
                style={({ pressed }) => [
                  styles.menuItem,
                  { backgroundColor: pressed ? theme.surface : 'transparent' },
                ]}
              >
                <Ionicons name="document-outline" size={18} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Als Word speichern</Text>
              </Pressable>
              {(canUndo || canRedo) && (
                <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />
              )}
              {canUndo && (
                <Pressable
                  onPress={() => {
                    setMenuVisible(false);
                    handleUndo();
                  }}
                  style={({ pressed }) => [
                    styles.menuItem,
                    { backgroundColor: pressed ? theme.surface : 'transparent' },
                  ]}
                >
                  <Ionicons name="arrow-undo" size={18} color={theme.text} />
                  <Text style={[styles.menuItemText, { color: theme.text }]}>Rückgängig</Text>
                </Pressable>
              )}
              {canRedo && (
                <Pressable
                  onPress={() => {
                    setMenuVisible(false);
                    handleRedo();
                  }}
                  style={({ pressed }) => [
                    styles.menuItem,
                    { backgroundColor: pressed ? theme.surface : 'transparent' },
                  ]}
                >
                  <Ionicons name="arrow-redo" size={18} color={theme.text} />
                  <Text style={[styles.menuItemText, { color: theme.text }]}>Wiederholen</Text>
                </Pressable>
              )}
              <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />
              <Pressable
                onPress={() => {
                  setMenuVisible(false);
                  onNewGeneration();
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  { backgroundColor: pressed ? theme.surface : 'transparent' },
                ]}
              >
                <Ionicons name="refresh-outline" size={18} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Neu grünerieren</Text>
              </Pressable>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xlarge,
    margin: spacing.medium,
    borderRadius: borderRadius.large,
    gap: spacing.medium,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
    paddingBottom: 90,
  },
  fab: {
    position: 'absolute',
    right: spacing.medium,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  fabBlur: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  fabPressable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  menuContainer: {
    position: 'absolute',
    minWidth: 180,
    borderRadius: borderRadius.medium,
    paddingVertical: spacing.xsmall,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
  },
  menuItemPrimary: {
    borderRadius: borderRadius.small,
    marginHorizontal: spacing.xsmall,
    marginVertical: spacing.xxsmall,
  },
  menuItemText: {
    fontSize: 15,
  },
  menuDivider: {
    height: 1,
    marginVertical: spacing.xxsmall,
  },
});

export default ContentDisplay;
