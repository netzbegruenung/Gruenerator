import { umfragenRegion } from '@gruenerator/shared/monitor';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { UmfragenView } from '../../components/umfragen/UmfragenView';
import { useMonitorLocale } from '../../hooks/monitor/monitorLocale';
import { useContentColumn } from '../../hooks/useLayout';
import { useTabBarClearance } from '../../hooks/useTabBarClearance';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, spacing, useDashboardColors } from '../../theme';
import { route, routeWithParams } from '../../types/routes';
import { goBackOr } from '../../utils/navigation';

/**
 * Umfragen: Sonntagsfrage und Ländertrends als Karte, nach dem Web (`/umfragen`) in
 * Handybreite. Das Land richtet sich nach dem Profil. `?land=bayern` zeigt dasselbe für ein
 * einzelnes Parlament; ein unbekanntes `land` führt zurück zur Übersicht.
 */
export default function UmfragenScreen() {
  const locale = useMonitorLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const dash = useDashboardColors();
  const column = useContentColumn('reading');
  const bottomClearance = useTabBarClearance(spacing.xxlarge);
  const { land } = useLocalSearchParams<{ land?: string }>();
  const region = land ? umfragenRegion(land) : null;
  const unknownLand = Boolean(land) && !region;
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (unknownLand) router.replace(routeWithParams('/(focused)/umfragen', {}));
  }, [unknownLand, router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Nur die Umfragen; die Geodaten ändern sich nicht. `.finally()` statt try/finally:
    // der React Compiler übersetzt kein try ohne catch.
    await queryClient
      .invalidateQueries({ queryKey: ['monitor', 'polls'] })
      .finally(() => setRefreshing(false));
  }, [queryClient]);

  return (
    <ScreenScaffold
      title="Umfragen"
      backdrop={<View style={[StyleSheet.absoluteFill, { backgroundColor: dash.page }]} />}
      onBack={() => goBackOr('/start')}
    >
      <ScrollView
        contentContainerStyle={[styles.content, column, { paddingBottom: bottomClearance }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
        }
      >
        {unknownLand ? null : (
          <>
            <View style={styles.head}>
              <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
                {region ? `Umfragen · ${region.label}` : 'Umfragen'}
              </Text>
              {region ? (
                <Pressable
                  onPress={() => router.replace(route('/(focused)/umfragen'))}
                  accessibilityRole="link"
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                >
                  <Text style={[styles.link, { color: dash.mg }]}>Alle Umfragen</Text>
                </Pressable>
              ) : null}
            </View>
            <UmfragenView locale={locale} region={region} />
          </>
        )}
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 12 },
  head: { gap: 8 },
  title: { fontFamily: HEADING_FONT_BOLD, fontSize: 30, lineHeight: 36 },
  link: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '700' },
});
