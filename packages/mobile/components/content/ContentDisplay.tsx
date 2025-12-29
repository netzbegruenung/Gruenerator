import { View, Text, StyleSheet, ScrollView, useColorScheme, Share, Pressable, Modal, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState, useCallback, useRef } from 'react';
import Markdown from 'react-native-markdown-display';
import { useRouter } from 'expo-router';
import { useGeneratedTextStore, extractEditableText } from '@gruenerator/shared/generators';
import { colors, typography, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

interface ContentDisplayProps {
  componentName: string;
  onNewGeneration: () => void;
  title?: string;
}

export function ContentDisplay({ componentName, onNewGeneration, title = 'Generierter Text' }: ContentDisplayProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();

  const [copied, setCopied] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuButtonRef = useRef<View>(null);

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
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPosition({ top: y + height + 4, right: 16 });
      setMenuVisible(true);
    });
  }, []);

  const handleMenuCopy = useCallback(async () => {
    setMenuVisible(false);
    await handleCopy();
  }, [handleCopy]);

  const handleEdit = useCallback(() => {
    router.push({
      pathname: '/(modals)/edit-chat' as const,
      params: { componentName },
    } as any);
  }, [router, componentName]);

  const handleUndo = useCallback(() => {
    undo(componentName);
  }, [undo, componentName]);

  const handleRedo = useCallback(() => {
    redo(componentName);
  }, [redo, componentName]);

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
          Noch kein Text generiert
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleUndo}
            disabled={!canUndo}
            style={({ pressed }) => [
              styles.iconButton,
              { opacity: canUndo ? (pressed ? 0.7 : 1) : 0.3 },
            ]}
          >
            <Ionicons name="arrow-undo" size={20} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={handleRedo}
            disabled={!canRedo}
            style={({ pressed }) => [
              styles.iconButton,
              { opacity: canRedo ? (pressed ? 0.7 : 1) : 0.3 },
            ]}
          >
            <Ionicons name="arrow-redo" size={20} color={theme.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Markdown style={markdownStyles}>{text}</Markdown>
      </ScrollView>

      <View style={[styles.actionBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <View style={styles.actionIconsLeft}>
          <Pressable
            onPress={handleCopy}
            style={({ pressed }) => [
              styles.iconButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={22} color={copied ? colors.primary[600] : theme.text} />
          </Pressable>

          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.iconButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="share-outline" size={22} color={theme.text} />
          </Pressable>

          <View ref={menuButtonRef} collapsable={false}>
            <Pressable
              onPress={openMenu}
              style={({ pressed }) => [
                styles.iconButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={theme.text} />
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={handleEdit}
          style={({ pressed }) => [
            styles.editButton,
            { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
          ]}
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.white} />
          <Text style={styles.editButtonText}>Bearbeiten</Text>
        </Pressable>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={styles.menuOverlay}>
            <View style={[styles.menuContainer, { backgroundColor: theme.card, top: menuPosition.top, right: menuPosition.right }]}>
              <Pressable
                onPress={handleMenuCopy}
                style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? theme.surface : 'transparent' }]}
              >
                <Ionicons name="copy-outline" size={18} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Kopieren</Text>
              </Pressable>
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? theme.surface : 'transparent' }]}
              >
                <Ionicons name="share-outline" size={18} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Teilen</Text>
              </Pressable>
              <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />
              <Pressable
                onPress={() => { setMenuVisible(false); onNewGeneration(); }}
                style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? theme.surface : 'transparent' }]}
              >
                <Ionicons name="refresh-outline" size={18} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Neu generieren</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: 1,
  },
  title: {
    ...typography.h3,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xsmall,
  },
  iconButton: {
    padding: spacing.xsmall,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderTopWidth: 1,
  },
  actionIconsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  iconButton: {
    padding: spacing.xsmall,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
  },
  editButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
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
  menuItemText: {
    fontSize: 15,
  },
  menuDivider: {
    height: 1,
    marginVertical: spacing.xxsmall,
  },
});

export default ContentDisplay;
