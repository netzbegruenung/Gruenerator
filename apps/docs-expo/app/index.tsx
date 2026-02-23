import { useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Platform,
  TextInput,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@gruenerator/shared/stores';
import { useDocsStore } from '../stores/docsStore';
import { logout, getValidToken } from '../services/auth';
import { lightTheme, darkTheme, colors } from '../theme';
import { templates, type DocumentTemplate } from '@gruenerator/docs/templates';
import { getAvatarDisplayProps, getRobotAvatarUrl } from '@gruenerator/shared/avatar';
import { exportDocument, type ExportFormat } from '../services/docs';

export default function DocumentsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user } = useAuthStore();

  const { documents, isLoading, error, fetchDocuments, createDocument, deleteDocument } =
    useDocsStore();
  const [showTemplates, setShowTemplates] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeDoc, setActiveDoc] = useState<{ id: string; title: string } | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter((doc) => (doc.title || 'Unbenannt').toLowerCase().includes(q));
  }, [documents, searchQuery]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [fetchDocuments, user]);

  const handleRefresh = useCallback(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleSelectTemplate = async (template: DocumentTemplate) => {
    if (isCreating) return;
    setIsCreating(true);
    setShowTemplates(false);
    try {
      const doc = await createDocument(
        template.defaultTitle,
        template.id === 'blank' ? undefined : template.id
      );
      if (doc) {
        router.push({ pathname: '/document/[id]', params: { id: doc.id } });
      }
    } catch {
      Alert.alert('Fehler', 'Dokument konnte nicht erstellt werden.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenActions = (id: string, title: string) => {
    setActiveDoc({ id, title: title || 'Unbenannt' });
  };

  const handleDelete = (id: string, title: string) => {
    setActiveDoc(null);
    Alert.alert('Dokument löschen', `Möchtest du "${title}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => deleteDocument(id),
      },
    ]);
  };

  const handleExport = async (format: ExportFormat) => {
    if (!activeDoc || exportingFormat) return;
    setExportingFormat(format);
    try {
      const token = await getValidToken();
      if (!token) {
        Alert.alert('Fehler', 'Nicht angemeldet. Bitte erneut einloggen.');
        return;
      }
      await exportDocument(activeDoc.id, activeDoc.title, format, token);
      setActiveDoc(null);
    } catch (err) {
      Alert.alert(
        'Export fehlgeschlagen',
        err instanceof Error ? err.message : 'Unbekannter Fehler'
      );
    } finally {
      setExportingFormat(null);
    }
  };

  const handleLogout = () => {
    Alert.alert('Abmelden', 'Möchtest du dich wirklich abmelden?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Abmelden',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const avatarProps = getAvatarDisplayProps(user);

  const renderDocument = ({
    item,
  }: {
    item: { id: string; title: string; updated_at: string };
  }) => (
    <TouchableOpacity
      style={[styles.gridCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      onPress={() => router.push({ pathname: '/document/[id]', params: { id: item.id } })}
      activeOpacity={0.7}
    >
      <View style={[styles.cardThumbnail, { backgroundColor: theme.surface }]}>
        <Ionicons name="document-text" size={36} color={colors.grey[300]} />
      </View>
      <View style={styles.cardInfoRow}>
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
          {item.title || 'Unbenannt'}
        </Text>
        <TouchableOpacity
          onPress={() => handleOpenActions(item.id, item.title)}
          style={styles.cardMenuButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
        {formatDate(item.updated_at)}
      </Text>
    </TouchableOpacity>
  );

  const renderListItem = ({
    item,
  }: {
    item: { id: string; title: string; updated_at: string };
  }) => (
    <TouchableOpacity
      style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      onPress={() => router.push({ pathname: '/document/[id]', params: { id: item.id } })}
      activeOpacity={0.7}
    >
      <Ionicons name="document-text" size={24} color={colors.grey[300]} style={styles.listIcon} />
      <View style={styles.listInfo}>
        <Text style={[styles.listTitle, { color: theme.text }]} numberOfLines={1}>
          {item.title || 'Unbenannt'}
        </Text>
        <Text style={[styles.listDate, { color: theme.textSecondary }]}>
          {formatDate(item.updated_at)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => handleOpenActions(item.id, item.title)}
        style={styles.cardMenuButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="ellipsis-vertical" size={16} color={theme.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-text-outline" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Dokumente</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Erstelle ein neues Dokument, um loszulegen.
      </Text>
    </View>
  );

  if (error) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top']}
      >
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error[500]} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Fehler beim Laden</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary[600] }]}
            onPress={handleRefresh}
          >
            <Text style={styles.retryButtonText}>Erneut versuchen</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Top Bar */}
      <View style={[styles.topBar, showProfileMenu && { zIndex: 10 }]}>
        <View
          style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Ionicons name="search" size={18} color={theme.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="In Dokumenten suchen"
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
            size={20}
            color={theme.textSecondary}
          />
        </TouchableOpacity>

        <View>
          <TouchableOpacity
            onPress={() => setShowProfileMenu((v) => !v)}
            style={[styles.avatar, { borderColor: colors.primary[600] }]}
            activeOpacity={0.7}
          >
            {avatarProps.type === 'robot' && avatarProps.robotId ? (
              <Image
                source={{ uri: getRobotAvatarUrl(avatarProps.robotId) }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={[styles.avatarText, { color: colors.primary[600] }]}>
                {avatarProps.initials}
              </Text>
            )}
          </TouchableOpacity>

          {showProfileMenu && (
            <View
              style={[
                styles.profileDropdown,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              {user?.display_name && (
                <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
                  {user.display_name}
                </Text>
              )}
              {user?.email && (
                <Text
                  style={[styles.profileEmail, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {user.email}
                </Text>
              )}
              <View style={[styles.profileDivider, { backgroundColor: theme.border }]} />
              <TouchableOpacity
                style={styles.profileMenuItem}
                onPress={() => {
                  setShowProfileMenu(false);
                  handleLogout();
                }}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.error[500]} />
                <Text style={[styles.profileMenuLabel, { color: colors.error[500] }]}>
                  Abmelden
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Dismiss profile dropdown when tapping elsewhere */}
      {showProfileMenu && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowProfileMenu(false)} />
      )}

      {/* Document Grid */}
      {isLoading && documents.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : filteredDocuments.length === 0 && searchQuery.trim() ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Ergebnisse</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Keine Dokumente für „{searchQuery}" gefunden.
          </Text>
        </View>
      ) : viewMode === 'grid' ? (
        <FlatList
          key="grid"
          data={filteredDocuments}
          keyExtractor={(item) => item.id}
          renderItem={renderDocument}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[
            styles.gridContent,
            filteredDocuments.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={handleRefresh}
              tintColor={colors.primary[600]}
              colors={[colors.primary[600]]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          key="list"
          data={filteredDocuments}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          contentContainerStyle={[
            styles.listContent,
            filteredDocuments.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={handleRefresh}
              tintColor={colors.primary[600]}
              colors={[colors.primary[600]]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB — rounded rectangle */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary[600] }]}
        onPress={() => setShowTemplates(true)}
        activeOpacity={0.8}
        disabled={isCreating}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Ionicons name="add" size={28} color="white" />
        )}
      </TouchableOpacity>

      {/* Template selection bottom sheet */}
      <Modal
        visible={showTemplates}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTemplates(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowTemplates(false)}>
          <Pressable
            style={[styles.bottomSheet, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: theme.textSecondary }]} />
            </View>
            <Text style={[styles.bottomSheetTitle, { color: theme.text }]}>Neues Dokument</Text>
            {templates.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={[styles.templateRow, { borderBottomColor: theme.border }]}
                onPress={() => handleSelectTemplate(template)}
                activeOpacity={0.7}
              >
                <Text style={styles.templateIcon}>{template.icon}</Text>
                <View style={styles.templateInfo}>
                  <Text style={[styles.templateName, { color: theme.text }]}>{template.name}</Text>
                  <Text style={[styles.templateDescription, { color: theme.textSecondary }]}>
                    {template.description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Document actions bottom sheet */}
      <Modal
        visible={!!activeDoc}
        transparent
        animationType="slide"
        onRequestClose={() => !exportingFormat && setActiveDoc(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !exportingFormat && setActiveDoc(null)}
        >
          <Pressable
            style={[styles.bottomSheet, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: theme.textSecondary }]} />
            </View>
            <Text style={[styles.bottomSheetTitle, { color: theme.text }]} numberOfLines={1}>
              {activeDoc?.title}
            </Text>

            <TouchableOpacity
              style={[styles.actionRow, { borderBottomColor: theme.border }]}
              onPress={() => handleExport('docx')}
              activeOpacity={0.7}
              disabled={!!exportingFormat}
            >
              <Ionicons name="document-outline" size={22} color={colors.primary[600]} />
              <Text style={[styles.actionLabel, { color: theme.text }]}>Als Word (.docx)</Text>
              {exportingFormat === 'docx' && (
                <ActivityIndicator size="small" color={colors.primary[600]} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRow, { borderBottomColor: theme.border }]}
              onPress={() => handleExport('pdf')}
              activeOpacity={0.7}
              disabled={!!exportingFormat}
            >
              <Ionicons name="document-text-outline" size={22} color={colors.primary[600]} />
              <Text style={[styles.actionLabel, { color: theme.text }]}>Als PDF (.pdf)</Text>
              {exportingFormat === 'pdf' && (
                <ActivityIndicator size="small" color={colors.primary[600]} />
              )}
            </TouchableOpacity>

            <View style={[styles.actionDivider, { backgroundColor: theme.border }]} />

            <TouchableOpacity
              style={[styles.actionRow, { borderBottomColor: 'transparent' }]}
              onPress={() => activeDoc && handleDelete(activeDoc.id, activeDoc.title)}
              activeOpacity={0.7}
              disabled={!!exportingFormat}
            >
              <Ionicons name="trash-outline" size={22} color={colors.error[500]} />
              <Text style={[styles.actionLabel, { color: colors.error[500] }]}>Löschen</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const CARD_GAP = 16;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 14,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  searchClear: {
    padding: 4,
    marginLeft: 4,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Profile Dropdown
  profileDropdown: {
    position: 'absolute',
    top: 42,
    right: 0,
    width: 220,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  profileName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 12,
  },
  profileDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  profileMenuLabel: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  sortIcon: {
    marginLeft: 2,
  },

  // Grid
  gridContent: {
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 96,
  },
  gridRow: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  listEmpty: {
    flex: 1,
  },
  gridCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardThumbnail: {
    aspectRatio: 3 / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  cardMenuButton: {
    padding: 4,
    marginLeft: 4,
    flexShrink: 0,
  },
  cardDate: {
    fontSize: 11,
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 10,
    marginLeft: 0,
  },

  // List view
  listContent: {
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 96,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  listIcon: {
    marginRight: 12,
  },
  listInfo: {
    flex: 1,
    marginRight: 8,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  listDate: {
    fontSize: 12,
  },

  // Empty / Loading / Error
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  // FAB — rounded rectangle
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    height: 56,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  // Bottom Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  bottomSheetHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  templateIcon: {
    fontSize: 28,
    width: 40,
  },
  templateInfo: {
    flex: 1,
    marginRight: 8,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  templateDescription: {
    fontSize: 13,
  },

  // Document Actions Bottom Sheet
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
    marginVertical: 4,
  },
});
