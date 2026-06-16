import { getVisibleSystemAgentsForLocale, type Agent } from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentCardList } from '../../components/agents/AgentCardList';
import { useUserAgents } from '../../hooks/agents/useUserAgents';
import { colors, spacing, typography, lightTheme, darkTheme } from '../../theme';
import { routeWithParams } from '../../types/routes';

export default function AgentsScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { locale } = useAuth();

  const { data: userAgents = [], isLoading } = useUserAgents();
  const systemAgents = useMemo(() => getVisibleSystemAgentsForLocale(locale), [locale]);

  const handleSelect = useCallback(
    (agent: Agent) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          agentId: agent.identifier,
        })
      );
    },
    [router]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Ionicons name="sparkles-outline" size={20} color={colors.primary[600]} />
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          Agent*innen
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary[600]} style={styles.loader} />
        ) : (
          userAgents.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Meine Agent*innen</Text>
              <AgentCardList agents={userAgents} onSelect={handleSelect} />
            </View>
          )
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Grünerator Agent*innen</Text>
          <AgentCardList agents={systemAgents} onSelect={handleSelect} />
        </View>
      </ScrollView>
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
    gap: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 2,
  },
  title: {
    ...typography.bodyBold,
    fontSize: 17,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxlarge,
  },
  loader: {
    paddingTop: spacing.xlarge,
  },
  section: {
    paddingTop: spacing.large,
    paddingHorizontal: spacing.medium,
    gap: spacing.small,
  },
  sectionTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 16,
  },
});
