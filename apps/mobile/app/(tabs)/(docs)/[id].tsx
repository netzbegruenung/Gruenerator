/**
 * Document Editor Screen
 * Native wrapper that loads the DOM-based collaborative editor
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@gruenerator/shared/stores';
import { useDocsStore, type Document } from '../../../stores/docsStore';
import { secureStorage } from '../../../services/storage';
import { lightTheme, darkTheme, colors } from '../../../theme';
import DocsEditor from '../../../components/dom/DocsEditor';

const HOCUSPOCUS_URL = process.env.EXPO_PUBLIC_HOCUSPOCUS_URL || 'wss://gruenerator.eu/hocuspocus';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { user } = useAuthStore();
  const { updateDocument, fetchDocument } = useDocsStore();

  const [token, setToken] = useState<string | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!id) {
        setError('Keine Dokument-ID angegeben');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Load auth token
        const authToken = await secureStorage.getToken();
        if (!authToken) {
          setError('Nicht angemeldet');
          setIsLoading(false);
          return;
        }
        setToken(authToken);

        // Fetch document details
        const doc = await fetchDocument(id);
        if (!doc) {
          setError('Dokument nicht gefunden');
          setIsLoading(false);
          return;
        }
        setDocument(doc);
      } catch (err) {
        console.error('[DocumentScreen] Failed to load document:', err);
        setError('Fehler beim Laden des Dokuments');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id, fetchDocument]);

  const handleNavigateBack = async () => {
    router.back();
  };

  const handleTitleChange = async (newTitle: string) => {
    if (!id) return;
    try {
      await updateDocument(id, { title: newTitle });
    } catch (err) {
      console.error('[DocumentScreen] Failed to update title:', err);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Dokument wird geladen...
        </Text>
      </View>
    );
  }

  if (error || !token || !document || !user) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error[500]} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>
          {error || 'Ein Fehler ist aufgetreten'}
        </Text>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.primary[600] }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color="white" />
          <Text style={styles.backButtonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <DocsEditor
      documentId={id}
      authToken={token}
      userId={user.id}
      userName={user.display_name || user.email}
      userEmail={user.email}
      documentTitle={document.title}
      initialContent={document.content || ''}
      hocuspocusUrl={HOCUSPOCUS_URL}
      apiBaseUrl={API_BASE_URL}
      onNavigateBack={handleNavigateBack}
      onTitleChange={handleTitleChange}
      dom={{ style: { flex: 1 } }}
    />
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
