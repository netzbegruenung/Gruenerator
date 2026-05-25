import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';

import {
  docsVersionsApi,
  type SnapshotSummary,
  type SnapshotPreview,
} from '../../services/docs/docsVersionsApi';
import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';
import { lightTheme, darkTheme, colors } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { DocPreview } from '../common/DocPreview';

interface Props {
  visible: boolean;
  onClose: () => void;
  documentId: string;
  canEdit: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NativeVersionHistorySheet({ visible, onClose, documentId, canEdit }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const bumpEditorEpoch = useDocsEditorBridgeStore((s) => s.bumpEditorEpoch);

  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<SnapshotPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadSnapshots = useCallback(() => {
    setLoading(true);
    docsVersionsApi
      .listSnapshots(documentId)
      .then(setSnapshots)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [documentId]);

  useEffect(() => {
    if (!visible) return;
    setPreview(null);
    setSaved(false);
    // Clear transient async flags so a sheet closed mid-flight doesn't reopen with a
    // phantom spinner tied to the previous open.
    setPreviewLoading(false);
    setRestoring(false);
    loadSnapshots();
  }, [visible, loadSnapshots]);

  const handleSaveVersion = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await docsVersionsApi.createSnapshot(documentId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      loadSnapshots();
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = async (version: number) => {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const result = await docsVersionsApi.getSnapshotPreview(documentId, version);
      if (result) setPreview(result);
    } catch {
      /* silent */
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRestore = (version: number) => {
    Alert.alert(
      'Version wiederherstellen?',
      `Das Dokument wird auf Version ${version} zurückgesetzt. Der aktuelle Stand bleibt als Version erhalten.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Wiederherstellen',
          style: 'destructive',
          onPress: () => {
            setRestoring(true);
            docsVersionsApi
              .restoreSnapshot(documentId, version)
              .then(() => {
                // Live Hocuspocus doc won't see the server-side restore update —
                // remount the editor to reconnect and reload from DB.
                bumpEditorEpoch();
                onClose();
              })
              .catch(() =>
                // Surface the failure — restore is destructive-feeling, a silent
                // no-op leaves the user unsure whether it worked.
                Alert.alert(
                  'Wiederherstellung fehlgeschlagen',
                  'Die Version konnte nicht wiederhergestellt werden. Bitte versuche es erneut.'
                )
              )
              .finally(() => setRestoring(false));
          },
        },
      ]
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Versionsverlauf</Text>
        <View style={{ width: 22 }} />
      </View>

      {canEdit && (
        <TouchableOpacity
          style={[styles.saveBtn, { borderColor: isDark ? colors.grey[700] : colors.grey[300] }]}
          onPress={handleSaveVersion}
          activeOpacity={0.6}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary[600]} />
          ) : (
            <Ionicons
              name={saved ? 'checkmark-circle' : 'bookmark-outline'}
              size={18}
              color={colors.primary[600]}
            />
          )}
          <Text style={[styles.saveBtnText, { color: colors.primary[600] }]}>
            {saved ? 'Gespeichert ✓' : 'Aktuelle Version speichern'}
          </Text>
        </TouchableOpacity>
      )}

      {(previewLoading || preview) && (
        <View style={styles.previewSection}>
          {previewLoading ? (
            <View style={styles.previewBox}>
              <ActivityIndicator size="small" color={colors.primary[600]} />
            </View>
          ) : preview ? (
            <>
              <DocPreview content={preview.html} style={styles.previewBox} />
              {canEdit && (
                <TouchableOpacity
                  style={[styles.restoreBtn, { backgroundColor: colors.primary[600] }]}
                  onPress={() => handleRestore(preview.version)}
                  activeOpacity={0.8}
                  disabled={restoring}
                >
                  {restoring ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Ionicons name="refresh" size={18} color={colors.white} />
                  )}
                  <Text style={styles.restoreBtnText}>
                    Version {preview.version} wiederherstellen
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary[600]} />
        </View>
      ) : snapshots.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Noch keine gespeicherten Versionen.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {snapshots.map((s) => {
            const isSelected = preview?.version === s.version;
            return (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.row,
                  isSelected && {
                    backgroundColor: isDark ? colors.primary[900] : colors.primary[50],
                  },
                ]}
                onPress={() => handleSelect(s.version)}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={s.is_auto_save ? 'time-outline' : 'bookmark'}
                  size={20}
                  color={isSelected ? colors.primary[600] : theme.textSecondary}
                />
                <View style={styles.rowContent}>
                  <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                    {s.label ||
                      (s.is_auto_save ? 'Automatische Sicherung' : `Version ${s.version}`)}
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.textSecondary }]} numberOfLines={1}>
                    {formatDate(s.created_at)}
                    {s.created_by_name ? ` · ${s.created_by_name}` : ''}
                    {s.snapshot_count > 1 ? ` · ${s.snapshot_count}×` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  loadingContainer: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14 },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  saveBtnText: { fontSize: 14, fontWeight: '600' },

  previewSection: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  previewBox: {
    height: 140,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.grey[300],
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  restoreBtnText: { fontSize: 14, fontWeight: '600', color: colors.white },

  list: { paddingHorizontal: 12, maxHeight: 360 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '500' },
  rowSub: { fontSize: 11, marginTop: 2 },
});
