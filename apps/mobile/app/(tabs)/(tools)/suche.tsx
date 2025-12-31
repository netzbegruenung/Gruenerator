import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGeneratedTextStore } from '@gruenerator/shared/stores';
import { useSearch, type SearchMode } from '@gruenerator/shared/search';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';
import { SearchInput, SourceList } from '../../../components/search';
import { ContentDisplay } from '../../../components/content';

const COMPONENT_NAME_WEB = 'search-web-summary';
const COMPONENT_NAME_DEEP = 'search-deep-dossier';

export default function SucheScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [currentMode, setCurrentMode] = useState<SearchMode>('web');

  const {
    loading,
    error,
    webResults,
    dossier,
    categorizedSources,
    webSearch,
    deepSearch,
    clearAllResults,
  } = useSearch();

  const setTextWithHistory = useGeneratedTextStore((state) => state.setTextWithHistory);
  const webContent = useGeneratedTextStore((state) => state.generatedTexts[COMPONENT_NAME_WEB] || '');
  const deepContent = useGeneratedTextStore((state) => state.generatedTexts[COMPONENT_NAME_DEEP] || '');

  const hasWebResults = webResults !== null;
  const hasDeepResults = dossier !== null;
  const hasResults = currentMode === 'web' ? hasWebResults : hasDeepResults;

  const handleSearch = useCallback(
    async (query: string, mode: SearchMode) => {
      setCurrentMode(mode);

      if (mode === 'deep') {
        await deepSearch(query);
      } else {
        await webSearch(query);
      }
    },
    [webSearch, deepSearch]
  );

  const handleNewSearch = useCallback(() => {
    clearAllResults();
    setTextWithHistory(COMPONENT_NAME_WEB, '');
    setTextWithHistory(COMPONENT_NAME_DEEP, '');
  }, [clearAllResults, setTextWithHistory]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (hasResults) {
          handleNewSearch();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [hasResults, handleNewSearch])
  );

  if (webResults?.summary?.text && !webContent) {
    setTextWithHistory(COMPONENT_NAME_WEB, webResults.summary.text);
  }

  if (dossier && !deepContent) {
    setTextWithHistory(COMPONENT_NAME_DEEP, dossier);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Ionicons name="search" size={28} color={colors.primary[600]} />
          <Text style={[styles.title, { color: theme.text }]}>Suche</Text>
        </View>

        <SearchInput onSearch={handleSearch} loading={loading} />

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              {currentMode === 'deep'
                ? 'Führe Tiefenrecherche durch...'
                : 'Durchsuche das Web...'}
            </Text>
          </View>
        )}

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.semantic.error + '15' }]}>
            <Ionicons name="alert-circle" size={20} color={colors.semantic.error} />
            <Text style={[styles.errorText, { color: colors.semantic.error }]}>{error}</Text>
          </View>
        )}

        {hasWebResults && currentMode === 'web' && webContent && (
          <View style={styles.resultsContainer}>
            <View style={[styles.summaryCard, { backgroundColor: theme.surface }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="sparkles" size={20} color={colors.primary[600]} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  AI-Zusammenfassung
                </Text>
              </View>
              <ContentDisplay
                componentName={COMPONENT_NAME_WEB}
                onNewGeneration={handleNewSearch}
              />
            </View>

            {webResults.results && webResults.results.length > 0 && (
              <SourceList
                sources={webResults.results.map((r) => ({
                  url: r.url,
                  title: r.title,
                  snippet: r.snippet,
                }))}
                title={`Web-Suchergebnisse (${webResults.resultCount})`}
              />
            )}

            {webResults.suggestions && webResults.suggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <Text style={[styles.suggestionsTitle, { color: theme.text }]}>
                  Suchvorschläge
                </Text>
                <View style={styles.suggestionsList}>
                  {webResults.suggestions.map((suggestion, index) => (
                    <Text
                      key={index}
                      style={[styles.suggestion, { color: colors.primary[600] }]}
                      onPress={() => handleSearch(suggestion, 'web')}
                    >
                      {suggestion}
                    </Text>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {hasDeepResults && currentMode === 'deep' && deepContent && (
          <View style={styles.resultsContainer}>
            <View style={[styles.dossierCard, { backgroundColor: theme.surface }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="document-text" size={20} color={colors.primary[600]} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Recherche-Dossier
                </Text>
              </View>
              <ContentDisplay
                componentName={COMPONENT_NAME_DEEP}
                onNewGeneration={handleNewSearch}
              />
            </View>

            {categorizedSources && Object.keys(categorizedSources).length > 0 && (
              <View style={styles.categorizedSources}>
                <Text style={[styles.categorizedTitle, { color: theme.text }]}>
                  Quellen nach Themenbereichen
                </Text>
                {Object.entries(categorizedSources).map(([category, sources]) => (
                  <SourceList
                    key={category}
                    sources={sources}
                    title={category}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
    paddingBottom: spacing.xxlarge,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    marginBottom: spacing.large,
  },
  title: {
    ...typography.h1,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: spacing.xlarge,
    gap: spacing.medium,
  },
  loadingText: {
    ...typography.body,
    textAlign: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    marginTop: spacing.medium,
  },
  errorText: {
    ...typography.body,
    flex: 1,
  },
  resultsContainer: {
    marginTop: spacing.large,
    gap: spacing.large,
  },
  summaryCard: {
    borderRadius: borderRadius.large,
    overflow: 'hidden',
  },
  dossierCard: {
    borderRadius: borderRadius.large,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    paddingBottom: 0,
  },
  sectionTitle: {
    ...typography.h3,
  },
  suggestionsContainer: {
    gap: spacing.small,
  },
  suggestionsTitle: {
    ...typography.h3,
  },
  suggestionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
  },
  suggestion: {
    ...typography.body,
    textDecorationLine: 'underline',
  },
  categorizedSources: {
    gap: spacing.medium,
  },
  categorizedTitle: {
    ...typography.h2,
    marginBottom: spacing.small,
  },
});
