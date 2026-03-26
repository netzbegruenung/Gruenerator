import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Share,
  ActivityIndicator,
  ScrollView,
} from 'react-native';

import { BottomSheet } from '../common/BottomSheet';
import { secureStorage } from '../../services/storage';
import { exportDocument, type ExportFormat } from '../../services/docs/docsApi';
import {
  docsShareApi,
  type ShareMode,
  type UserCollaborator,
  type GroupCollaborator,
  type GroupSummary,
} from '../../services/docs/docsShareApi';
import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';
import { lightTheme, darkTheme, colors } from '../../theme';

const DOCS_BASE_URL = 'https://docs.gruenerator.eu';

const SHARE_MODE_CONFIG: Array<{ mode: ShareMode; icon: keyof typeof Ionicons.glyphMap; label: string; desc: string }> = [
  { mode: 'private', icon: 'lock-closed', label: 'Privat', desc: 'Nur eingeladene Personen' },
  { mode: 'authenticated', icon: 'people', label: 'Mit Anmeldung', desc: 'Alle angemeldeten Nutzer*innen' },
  { mode: 'public', icon: 'globe', label: 'Öffentlich', desc: 'Alle mit dem Link' },
];

const PERMISSION_LABELS: Record<string, string> = {
  owner: 'Eigentümer*in',
  editor: 'Bearbeiter*in',
  viewer: 'Betrachter*in',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  documentId: string;
  userDisplayName?: string;
  isOwner?: boolean;
  onDelete?: () => void;
}

function QuickAction({ icon, label, onPress, theme }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; theme: typeof lightTheme;
}) {
  const isDark = theme === darkTheme;
  return (
    <TouchableOpacity
      style={[styles.quickAction, { backgroundColor: isDark ? colors.grey[800] : colors.grey[100] }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.quickIcon, { backgroundColor: isDark ? colors.grey[700] : colors.grey[200] }]}>
        <Ionicons name={icon} size={18} color={colors.primary[600]} />
      </View>
      <Text style={[styles.quickLabel, { color: theme.text }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function PermissionsSheet({ visible, onClose, documentId, theme }: {
  visible: boolean; onClose: () => void; documentId: string; theme: typeof lightTheme;
}) {
  const isDark = theme === darkTheme;
  const [shareMode, setShareMode] = useState<ShareMode>('private');
  const [sharePermission, setSharePermission] = useState<'viewer' | 'editor'>('viewer');
  const [collaborators, setCollaborators] = useState<UserCollaborator[]>([]);
  const [groupCollabs, setGroupCollabs] = useState<GroupCollaborator[]>([]);
  const [availableGroups, setAvailableGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    Promise.all([
      docsShareApi.getShareSettings(documentId),
      docsShareApi.getCollaborators(documentId),
      docsShareApi.getUserGroups(),
    ])
      .then(([settings, collabs, groups]) => {
        setShareMode(settings.share_mode);
        setSharePermission(settings.share_permission);
        setCollaborators(collabs.users || []);
        setGroupCollabs(collabs.groups || []);
        setAvailableGroups(groups || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, documentId]);

  const updateMode = async (mode: ShareMode) => {
    try { await docsShareApi.updateShareMode(documentId, mode); setShareMode(mode); } catch {}
  };

  const togglePermission = async () => {
    const next = sharePermission === 'viewer' ? 'editor' : 'viewer';
    try { await docsShareApi.updateSharePermission(documentId, next); setSharePermission(next); } catch {}
  };

  const removeCollab = async (userId: string) => {
    try { await docsShareApi.removeCollaborator(documentId, userId); setCollaborators((p) => p.filter((c) => c.user_id !== userId)); } catch {}
  };

  const addGroup = async (group: GroupSummary) => {
    try {
      await docsShareApi.shareWithGroup(documentId, group.id, 'editor');
      setGroupCollabs((p) => [...p, { type: 'group', group_id: group.id, group_name: group.name, permission_level: 'editor', shared_at: new Date().toISOString(), member_count: 0 }]);
    } catch {}
  };

  const removeGroup = async (groupId: string) => {
    try { await docsShareApi.unshareFromGroup(documentId, groupId); setGroupCollabs((p) => p.filter((g) => g.group_id !== groupId)); } catch {}
  };

  const unsharedGroups = (availableGroups || []).filter(
    (g) => !(groupCollabs || []).some((gc) => gc.group_id === g.id)
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Berechtigungen</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary[600]} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.permSection}>
            <Text style={[styles.permSectionLabel, { color: theme.textSecondary }]}>Zugriff</Text>
            {SHARE_MODE_CONFIG.map((opt) => (
              <TouchableOpacity
                key={opt.mode}
                style={[styles.permOption, shareMode === opt.mode && { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] }]}
                onPress={() => updateMode(opt.mode)}
                activeOpacity={0.6}
              >
                <Ionicons name={opt.icon} size={20} color={shareMode === opt.mode ? colors.primary[600] : theme.textSecondary} />
                <View style={styles.permOptionContent}>
                  <Text style={[styles.permOptionLabel, { color: shareMode === opt.mode ? colors.primary[600] : theme.text }]}>{opt.label}</Text>
                  <Text style={[styles.permOptionDesc, { color: theme.textSecondary }]}>{opt.desc}</Text>
                </View>
                {shareMode === opt.mode && <Ionicons name="checkmark" size={18} color={colors.primary[600]} />}
              </TouchableOpacity>
            ))}
          </View>

          {shareMode !== 'private' && (
            <View style={styles.permSection}>
              <Text style={[styles.permSectionLabel, { color: theme.textSecondary }]}>Link-Berechtigung</Text>
              <TouchableOpacity style={styles.permToggle} onPress={togglePermission} activeOpacity={0.6}>
                <Ionicons name={sharePermission === 'editor' ? 'create-outline' : 'eye-outline'} size={20} color={colors.primary[600]} />
                <Text style={[styles.permOptionLabel, { color: theme.text, flex: 1 }]}>
                  {sharePermission === 'editor' ? 'Kann bearbeiten' : 'Kann ansehen'}
                </Text>
                <Ionicons name="swap-horizontal" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {collaborators.length > 0 && (
            <View style={styles.permSection}>
              <Text style={[styles.permSectionLabel, { color: theme.textSecondary }]}>Personen</Text>
              {collaborators.map((c) => (
                <View key={c.user_id} style={styles.permRow}>
                  <View style={[styles.permAvatar, { backgroundColor: colors.primary[100] }]}>
                    <Text style={styles.permAvatarText}>{(c.display_name || c.email).slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={styles.permRowContent}>
                    <Text style={[styles.permRowName, { color: theme.text }]} numberOfLines={1}>{c.display_name || c.email}</Text>
                    <Text style={[styles.permRowSub, { color: theme.textSecondary }]}>{PERMISSION_LABELS[c.permission_level]}</Text>
                  </View>
                  {c.permission_level !== 'owner' && (
                    <TouchableOpacity onPress={() => removeCollab(c.user_id)} hitSlop={8}>
                      <Ionicons name="close-circle-outline" size={20} color={colors.error[400]} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          {(groupCollabs.length > 0 || unsharedGroups.length > 0) && (
            <View style={styles.permSection}>
              <Text style={[styles.permSectionLabel, { color: theme.textSecondary }]}>Gruppen</Text>
              {groupCollabs.map((g) => (
                <View key={g.group_id} style={styles.permRow}>
                  <Ionicons name="people" size={18} color={colors.secondary[600]} style={styles.permGroupIcon} />
                  <Text style={[styles.permRowName, { color: theme.text, flex: 1 }]} numberOfLines={1}>{g.group_name}</Text>
                  <TouchableOpacity onPress={() => removeGroup(g.group_id)} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={20} color={colors.error[400]} />
                  </TouchableOpacity>
                </View>
              ))}
              {unsharedGroups.length > 0 && (
                <View style={styles.chipRow}>
                  {unsharedGroups.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => addGroup(g)}
                      style={[styles.addChip, { borderColor: isDark ? colors.grey[700] : colors.grey[300] }]}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="add" size={14} color={colors.primary[600]} />
                      <Text style={styles.addChipText}>{g.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

export function NativeShareModal({ visible, onClose, documentId, userDisplayName, isOwner = false, onDelete }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const documentTitle = useDocsEditorBridgeStore((s) => s.documentTitle) || 'Dokument';

  const [copiedLink, setCopiedLink] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

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
    try { await Share.share({ message, title: documentTitle }); } catch {}
  }, [shareUrl, documentTitle, userDisplayName]);

  const handleExport = useCallback(async (format: ExportFormat) => {
    if (exportingFormat) return;
    setExportingFormat(format);
    setShowDownload(false);
    try {
      const token = await secureStorage.getToken();
      if (!token) return;
      await exportDocument(documentId, documentTitle, format, token);
    } catch {} finally {
      setExportingFormat(null);
    }
  }, [documentId, documentTitle, exportingFormat]);

  const handleTextFormatExport = useCallback(async (format: 'markdown' | 'text') => {
    if (exportingFormat) return;
    setExportingFormat(format as ExportFormat);
    setShowDownload(false);
    try {
      const token = await secureStorage.getToken();
      if (!token) return;
      const API_BASE_URL = process.env.EXPO_PUBLIC_DOCS_API_URL || 'https://docs.gruenerator.eu/api';
      const res = await fetch(`${API_BASE_URL}/docs/${documentId}/export/${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export fehlgeschlagen');
      const content = await res.text();
      const ext = format === 'markdown' ? 'md' : 'txt';
      const safeTitle = (documentTitle || 'Dokument').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '_');
      const file = new File(Paths.cache, `${safeTitle}.${ext}`);
      file.write(content);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
    } catch {} finally {
      setExportingFormat(null);
    }
  }, [documentId, documentTitle, exportingFormat]);

  return (
    <>
      {/* Main share modal */}
      <BottomSheet visible={visible} onClose={onClose}>
        <View style={styles.grid}>
          <QuickAction icon={copiedLink ? 'checkmark-circle' : 'link'} label={copiedLink ? 'Kopiert!' : 'Link kopieren'} onPress={handleCopyLink} theme={theme} />
          <QuickAction icon="share-social" label="Teilen" onPress={handleNativeShare} theme={theme} />
          {isOwner && (
            <QuickAction icon="shield-checkmark" label="Zugriff" onPress={() => setShowPermissions(true)} theme={theme} />
          )}
          <QuickAction icon="download-outline" label="Download" onPress={() => setShowDownload(true)} theme={theme} />
          {onDelete && (
            <QuickAction icon="trash-outline" label="Löschen" onPress={() => { onClose(); onDelete(); }} theme={theme} />
          )}
        </View>
      </BottomSheet>

      {/* Permissions sub-modal */}
      <PermissionsSheet
        visible={showPermissions}
        onClose={() => setShowPermissions(false)}
        documentId={documentId}
        theme={theme}
      />

      {/* Download sub-modal */}
      <BottomSheet visible={showDownload} onClose={() => setShowDownload(false)}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={() => setShowDownload(false)} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Herunterladen</Text>
          <View style={{ width: 22 }} />
        </View>
        <TouchableOpacity style={styles.downloadRow} onPress={() => handleExport('docx')} activeOpacity={0.6}>
          <Ionicons name="document-outline" size={24} color={colors.primary[600]} />
          <View style={styles.downloadRowContent}>
            <Text style={[styles.downloadRowTitle, { color: theme.text }]}>Word</Text>
            <Text style={[styles.downloadRowSub, { color: theme.textSecondary }]}>.docx — Microsoft Word</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.downloadRow} onPress={() => handleExport('pdf')} activeOpacity={0.6}>
          <Ionicons name="document-text-outline" size={24} color="#E53935" />
          <View style={styles.downloadRowContent}>
            <Text style={[styles.downloadRowTitle, { color: theme.text }]}>PDF</Text>
            <Text style={[styles.downloadRowSub, { color: theme.textSecondary }]}>.pdf — Portable Document</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.downloadRow} onPress={() => handleTextFormatExport('markdown')} activeOpacity={0.6}>
          <Ionicons name="code-slash-outline" size={24} color={colors.secondary[600]} />
          <View style={styles.downloadRowContent}>
            <Text style={[styles.downloadRowTitle, { color: theme.text }]}>Markdown</Text>
            <Text style={[styles.downloadRowSub, { color: theme.textSecondary }]}>.md — Textformat</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.downloadRow} onPress={() => handleTextFormatExport('text')} activeOpacity={0.6}>
          <Ionicons name="text-outline" size={24} color={theme.textSecondary} />
          <View style={styles.downloadRowContent}>
            <Text style={[styles.downloadRowTitle, { color: theme.text }]}>Text</Text>
            <Text style={[styles.downloadRowSub, { color: theme.textSecondary }]}>.txt — Klartext</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  loadingContainer: { padding: 40, alignItems: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  quickAction: { width: '45%', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  quickIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 13, fontWeight: '500', flexShrink: 1 },

  downloadRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
  downloadRowContent: { flex: 1 },
  downloadRowTitle: { fontSize: 15, fontWeight: '600' },
  downloadRowSub: { fontSize: 12 },

  permSection: { paddingHorizontal: 20, paddingVertical: 8 },
  permSectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  permOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 2 },
  permOptionContent: { flex: 1 },
  permOptionLabel: { fontSize: 14, fontWeight: '500' },
  permOptionDesc: { fontSize: 12 },
  permToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  permRowContent: { flex: 1 },
  permRowName: { fontSize: 14, fontWeight: '500' },
  permRowSub: { fontSize: 11 },
  permAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  permAvatarText: { fontSize: 11, fontWeight: '700', color: colors.primary[600] },
  permGroupIcon: { marginRight: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  addChipText: { fontSize: 12, color: colors.primary[600] },
});
