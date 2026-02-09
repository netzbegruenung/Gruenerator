import { useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@gruenerator/shared/stores';
import { useDocsStore } from '../stores/docsStore';
import { logout } from '../services/auth';
import { lightTheme, darkTheme, colors } from '../theme';

export default function DocumentsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user } = useAuthStore();

  const { documents, isLoading, error, fetchDocuments, createDocument, deleteDocument } =
    useDocsStore();

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [fetchDocuments, user]);

  const handleRefresh = useCallback(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleCreate = async () => {
    try {
      const doc = await createDocument('Neues Dokument');
      if (doc) {
        router.push({ pathname: '/document/[id]', params: { id: doc.id } });
      }
    } catch {
      Alert.alert('Fehler', 'Dokument konnte nicht erstellt werden.');
    }
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Dokument löschen', `Möchtest du "${title}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => deleteDocument(id),
      },
    ]);
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

  const renderDocument = ({
    item,
  }: {
    item: { id: string; title: string; updated_at: string };
  }) => (
    <TouchableOpacity
      style={[styles.documentCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      onPress={() => router.push({ pathname: '/document/[id]', params: { id: item.id } })}
      activeOpacity={0.7}
    >
      <View style={styles.documentIcon}>
        <Ionicons name="document-text" size={28} color={colors.primary[600]} />
      </View>
      <View style={styles.documentInfo}>
        <Text style={[styles.documentTitle, { color: theme.text }]} numberOfLines={1}>
          {item.title || 'Unbenannt'}
        </Text>
        <Text style={[styles.documentDate, { color: theme.textSecondary }]}>
          Bearbeitet: {formatDate(item.updated_at)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => handleDelete(item.id, item.title)}
        style={styles.deleteButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={20} color={colors.error[500]} />
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

      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Dokumente</Text>
        <TouchableOpacity
          onPress={handleLogout}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="log-out-outline" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.createButton, { backgroundColor: colors.primary[600] }]}
        onPress={handleCreate}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={24} color="white" />
        <Text style={styles.createButtonText}>Neues Dokument</Text>
      </TouchableOpacity>

      {isLoading && documents.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          renderItem={renderDocument}
          contentContainerStyle={[styles.list, documents.length === 0 && styles.listEmpty]}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  listEmpty: {
    flex: 1,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  documentIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(49, 96, 73, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
    marginRight: 8,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  documentDate: {
    fontSize: 13,
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
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
});
