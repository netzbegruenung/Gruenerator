import { type MonitorLocale, type MonitorSnapshot } from '@gruenerator/contracts';
import { buildBriefingLead, standLine } from '@gruenerator/shared/monitor';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { type BriefingNews } from '../../hooks/monitor/useBriefingNews';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD } from '../../theme';
import { LoadErrorNotice } from '../workplace/LoadErrorNotice';

import {
  BRIEFING_CARDS,
  parseBriefingCard,
  type BriefingCardId,
  type BriefingCardState,
} from './BriefingCard';
import { BriefingLeadLine } from './BriefingLeadLine';
import { NewsCard } from './NewsCard';
import { KeywordsCard, ThemenCard, XTrendsCard } from './SignalCards';

export interface BriefingViewProps {
  locale: MonitorLocale;
  /** `null`, solange er lädt oder wenn es auf der Instanz noch keinen gibt. */
  snapshot: MonitorSnapshot | null;
  snapshotPending: boolean;
  news: BriefingNews;
  /** Hat eine Abfrage versagt? Die Daten im Cache bleiben stehen, darunter steht der Hinweis. */
  error: boolean;
  onRetry: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Eine Karte im Screen; ihre Lage merkt sich der Screen, um nach dem Zuklappen zurückzuspringen. */
function CardSlot({
  id,
  onPosition,
  children,
}: {
  id: BriefingCardId;
  onPosition: (id: BriefingCardId, y: number) => void;
  children: ReactNode;
}) {
  return (
    <Animated.View
      layout={LinearTransition}
      onLayout={(e) => onPosition(id, e.nativeEvent.layout.y)}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Das Briefing ohne Datenabruf: Leitsatz, sechs Karten, Stand. Der Screen reicht die
 * Daten herein (Vorlage: `BriefingView` im Web). Höchstens eine Karte ist offen; der
 * Parameter `karte` öffnet die passende beim Start, ein unbekannter Wert keine.
 */
export function BriefingView({
  locale,
  snapshot,
  snapshotPending,
  news,
  error,
  onRetry,
  refreshing,
  onRefresh,
  contentStyle,
}: BriefingViewProps) {
  const theme = useTheme();
  const { karte } = useLocalSearchParams<{ karte?: string }>();

  const available = useMemo(
    () => BRIEFING_CARDS.filter((id) => id !== 'landesverbaende' || news.landesverbaende !== null),
    [news.landesverbaende]
  );
  const [open, setOpen] = useState<BriefingCardId | null>(() =>
    parseBriefingCard(karte, available)
  );

  // Lage der Karten und Scrollstand liegen in Refs: nichts davon rendert.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const positions = useRef<Partial<Record<BriefingCardId, number>>>({});
  const onPosition = useCallback((id: BriefingCardId, y: number) => {
    positions.current[id] = y;
  }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  const toggle = useCallback(
    (id: BriefingCardId) => {
      // Eine lange offene Karte, deren Kopf schon oben aus dem Bild ist: nach dem
      // Zuklappen stünde man sonst irgendwo weiter unten auf dem Screen.
      const y = positions.current[id];
      if (open === id && y !== undefined && y < scrollY.current) {
        scrollRef.current?.scrollTo({ y, animated: true });
      }
      setOpen((cur) => (cur === id ? null : id));
    },
    [open]
  );
  const openCard = useCallback((id: BriefingCardId) => setOpen(id), []);

  const card = (id: BriefingCardId): BriefingCardState => ({
    id,
    open: open === id,
    onToggle: () => toggle(id),
  });
  // Noch ladend → Platzhalter; geladen, aber ohne Snapshot → leere Karten.
  const pick = <T,>(value: (s: MonitorSnapshot) => T, empty: T): T | null =>
    snapshotPending ? null : snapshot ? value(snapshot) : empty;

  const lead =
    snapshot && !news.greensPending
      ? buildBriefingLead(snapshot.topics, news.greensArticles)
      : null;
  const greensTitles = useMemo(
    () => news.greensArticles.map((a) => a.title),
    [news.greensArticles]
  );

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, contentStyle]}
      onScroll={onScroll}
      scrollEventThrottle={32}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      aria-busy={snapshotPending}
    >
      <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
        Briefing
      </Text>

      <BriefingLeadLine
        lead={lead}
        pending={snapshotPending || news.greensPending}
        onOpen={openCard}
      />

      <CardSlot id="themen" onPosition={onPosition}>
        <ThemenCard state={card('themen')} topics={pick((s) => s.topics, [])} />
      </CardSlot>
      <CardSlot id="keywords" onPosition={onPosition}>
        <KeywordsCard state={card('keywords')} keywords={pick((s) => s.keywords, [])} />
      </CardSlot>
      <CardSlot id="trends" onPosition={onPosition}>
        <XTrendsCard
          state={card('trends')}
          trends={pick((s) => s.socialTrends, [])}
          keywords={snapshot?.keywords ?? []}
          greensTitles={greensTitles}
          locale={locale}
        />
      </CardSlot>
      <CardSlot id="wichtig" onPosition={onPosition}>
        <NewsCard
          state={card('wichtig')}
          title="Heute wichtig"
          list={news.important}
          emptyText="Gerade keine Meldungen."
        />
      </CardSlot>
      <CardSlot id="gruene" onPosition={onPosition}>
        <NewsCard
          state={card('gruene')}
          title="Über die Grünen"
          list={news.greens}
          emptyText="Keine Berichte über die Grünen in den letzten 24 Stunden."
        />
      </CardSlot>
      {news.landesverbaende ? (
        <CardSlot id="landesverbaende" onPosition={onPosition}>
          <NewsCard
            state={card('landesverbaende')}
            title="Landesverbände"
            list={news.landesverbaende}
            emptyText="Die Landesverbände haben in den letzten sieben Tagen nichts veröffentlicht."
          />
        </CardSlot>
      ) : null}

      {error ? (
        <LoadErrorNotice
          title="Nicht alles geladen"
          description="Das Briefing konnte nicht vollständig geladen werden."
          onRetry={onRetry}
        />
      ) : null}

      {snapshot ? (
        <View>
          <Text style={[styles.stand, { color: theme.textSecondary }]}>{standLine(snapshot)}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 12 },
  title: { fontFamily: HEADING_FONT_BOLD, fontSize: 30, lineHeight: 36 },
  stand: { fontFamily: BODY_FONT, fontSize: 13, paddingTop: 8 },
});
