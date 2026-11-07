import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BriefingView } from '../../components/briefing/BriefingView';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { useMonitorLocale } from '../../hooks/monitor/monitorLocale';
import { useBriefingNews } from '../../hooks/monitor/useBriefingNews';
import { useMonitorSnapshot } from '../../hooks/monitor/useMonitor';
import { useContentColumn } from '../../hooks/useLayout';
import { useTabBarClearance } from '../../hooks/useTabBarClearance';
import { spacing, useDashboardColors } from '../../theme';
import { goBackOr } from '../../utils/navigation';

/**
 * Das Briefing: Feed, Watcher und Themen & Trends auf einem Screen. Nach dem Web
 * (`/briefing`) in Handybreite; „Trends“ auf dem Wissen-Screen öffnet es mit
 * `?karte=keywords`.
 */
export default function BriefingScreen() {
  const locale = useMonitorLocale();
  const queryClient = useQueryClient();
  const dash = useDashboardColors();
  const column = useContentColumn('reading');
  const bottomClearance = useTabBarClearance(spacing.xxlarge);
  const snapshot = useMonitorSnapshot(locale);
  const news = useBriefingNews(locale);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // `.finally()` statt try/finally: der React Compiler übersetzt kein try ohne catch.
    await queryClient
      .invalidateQueries({ queryKey: ['monitor'] })
      .finally(() => setRefreshing(false));
  }, [queryClient]);

  const handleRetry = useCallback(() => {
    if (snapshot.isError) void snapshot.refetch();
    news.refetch();
  }, [snapshot, news]);

  return (
    <ScreenScaffold
      title="Briefing"
      backdrop={<View style={[StyleSheet.absoluteFill, { backgroundColor: dash.page }]} />}
      onBack={() => goBackOr('/start')}
    >
      <BriefingView
        locale={locale}
        snapshot={snapshot.data ?? null}
        snapshotPending={snapshot.isPending}
        news={news}
        error={snapshot.isError || news.error}
        onRetry={handleRetry}
        refreshing={refreshing}
        onRefresh={() => void handleRefresh()}
        contentStyle={[column, { paddingBottom: bottomClearance }]}
      />
    </ScreenScaffold>
  );
}
