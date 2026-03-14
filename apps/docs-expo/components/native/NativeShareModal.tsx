import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  useColorScheme,
  Share,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getValidToken } from '../../services/auth';
import { exportDocument, type ExportFormat } from '../../services/docs';
import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';
import { lightTheme, darkTheme, colors } from '../../theme/colors';

const DOCS_BASE_URL = 'https://docs.gruenerator.eu';

interface NativeShareModalProps {
  visible: boolean;
  onClose: () => void;
  documentId: string;
  userDisplayName?: string;
}

export function NativeShareModal({
  visible,
  onClose,
  documentId,
  userDisplayName,
}: NativeShareModalProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const documentTitle = useDocsEditorBridgeStore((s) => s.documentTitle) || 'Dokument';

  const [copiedLink, setCopiedLink] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const shareUrl = `${DOCS_BASE_URL}/document/${documentId}`;

  const handleCopyLink = useCallback(async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, [shareUrl]);

  const handleNativeShare = useCallback(async () => {
    const message = userDisplayName
      ? `${userDisplayName} möchte „${documentTitle}" mit dir teilen:\n${shareUrl}`
      : shareUrl;
    try {
      await Share.share({ message, title: documentTitle });
    } catch {
      // User cancelled — non-critical
    }
  }, [shareUrl, documentTitle, userDisplayName]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (exportingFormat) return;
      setExportingFormat(format);
      try {
        const token = await getValidToken();
        if (!token) {
          Alert.alert('Fehler', 'Nicht angemeldet. Bitte erneut einloggen.');
          return;
        }
        await exportDocument(documentId, documentTitle, format, token);
      } catch (err) {
        Alert.alert(
          'Export fehlgeschlagen',
          err instanceof Error ? err.message : 'Unbekannter Fehler'
        );
      } finally {
        setExportingFormat(null);
      }
    },
    [documentId, documentTitle, exportingFormat]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom || 20,
              backgroundColor: theme.background,
              borderColor: theme.border,
            },
          ]}
          onPress={() => {}}
        >
          {/* Handle bar */}
          <View style={styles.handleRow}>
            <View
              style={[
                styles.handle,
                { backgroundColor: isDark ? colors.grey[600] : colors.grey[300] },
              ]}
            />
          </View>

          {/* Title */}
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text }]}>Teilen</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Schließen"
            >
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Link section */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Link</Text>
            <View
              style={[
                styles.linkBox,
                {
                  backgroundColor: isDark ? colors.grey[900] : colors.grey[50],
                  borderColor: isDark ? colors.grey[700] : colors.grey[200],
                },
              ]}
            >
              <Ionicons
                name="link-outline"
                size={18}
                color={theme.textSecondary}
                style={{ marginRight: 8 }}
              />
              <Text
                style={[styles.linkText, { color: theme.text }]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {shareUrl}
              </Text>
            </View>
            <View style={styles.linkActions}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: copiedLink
                      ? colors.primary[50]
                      : isDark
                        ? colors.grey[800]
                        : colors.grey[100],
                    borderColor: copiedLink
                      ? colors.primary[400]
                      : isDark
                        ? colors.grey[700]
                        : colors.grey[200],
                  },
                ]}
                onPress={handleCopyLink}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={copiedLink ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={copiedLink ? colors.primary[600] : theme.text}
                />
                <Text
                  style={[
                    styles.actionBtnText,
                    { color: copiedLink ? colors.primary[600] : theme.text },
                  ]}
                >
                  {copiedLink ? 'Kopiert!' : 'Kopieren'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.actionBtnPrimary,
                  { backgroundColor: colors.primary[600] },
                ]}
                onPress={handleNativeShare}
                activeOpacity={0.7}
              >
                <Ionicons name="share-outline" size={18} color="white" />
                <Text style={[styles.actionBtnText, { color: 'white' }]}>Teilen</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Divider */}
          <View
            style={[
              styles.divider,
              { backgroundColor: isDark ? colors.grey[800] : colors.grey[200] },
            ]}
          />

          {/* Export section */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Exportieren</Text>
            <View style={styles.exportGrid}>
              <TouchableOpacity
                style={[
                  styles.exportCard,
                  {
                    backgroundColor: isDark ? colors.grey[900] : colors.grey[50],
                    borderColor: isDark ? colors.grey[700] : colors.grey[200],
                  },
                ]}
                onPress={() => handleExport('docx')}
                disabled={!!exportingFormat}
                activeOpacity={0.7}
              >
                {exportingFormat === 'docx' ? (
                  <ActivityIndicator size="small" color={colors.primary[600]} />
                ) : (
                  <Ionicons name="document-outline" size={28} color={colors.primary[600]} />
                )}
                <Text style={[styles.exportTitle, { color: theme.text }]}>Word</Text>
                <Text style={[styles.exportSubtitle, { color: theme.textSecondary }]}>.docx</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.exportCard,
                  {
                    backgroundColor: isDark ? colors.grey[900] : colors.grey[50],
                    borderColor: isDark ? colors.grey[700] : colors.grey[200],
                  },
                ]}
                onPress={() => handleExport('pdf')}
                disabled={!!exportingFormat}
                activeOpacity={0.7}
              >
                {exportingFormat === 'pdf' ? (
                  <ActivityIndicator size="small" color={colors.primary[600]} />
                ) : (
                  <Ionicons name="document-text-outline" size={28} color="#E53935" />
                )}
                <Text style={[styles.exportTitle, { color: theme.text }]}>PDF</Text>
                <Text style={[styles.exportSubtitle, { color: theme.textSecondary }]}>.pdf</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
  },
  linkActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnPrimary: {
    borderWidth: 0,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
    marginVertical: 16,
  },
  exportGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  exportCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  exportTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  exportSubtitle: {
    fontSize: 12,
  },
});
