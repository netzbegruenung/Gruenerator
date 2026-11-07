import { type DashboardArticle } from '@gruenerator/shared/monitor';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as WebBrowser from 'expo-web-browser';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD } from '../../theme';
import { NewsMeta } from '../dashboard/NewsMeta';
import { SLIDE_INTERVAL_MS, SlideStack, type Slide } from '../dashboard/SlideStack';

import { AsideTitle, CardError, SliderCard } from './WissenLayout';
import { SliderSkeleton } from './WissenSkeletons';

/** Überschrift und Name der Region — wie „Trends“ und „Umfragen“ ein Link auf die volle Seite. */
export const SLIDER_TITLE = 'Briefing';

const EMPTY_TEXT = 'Gerade keine neuen Schlagzeilen.';

/** Der Titel hat denselben Rand wie die Folien (Web: `SLIDER_HEAD`). */
const SliderTitle = memo(function SliderTitle({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.head}>
      <AsideTitle
        title={SLIDER_TITLE}
        onPress={onPress}
        hint="Öffnet das Briefing mit allen Meldungen"
      />
    </View>
  );
});

/**
 * Eine Folie. `memo`: beim Wechsel rendert sie nicht neu (gleiches Element im
 * `slides`-Array); ein Druck öffnet den Artikel im In-App-Browser.
 */
const HeadlineSlide = memo(function HeadlineSlide({
  article: a,
  position,
}: {
  article: DashboardArticle;
  /** z. B. „Meldung 2 von 6“ — zugänglicher Name der Folie. */
  position: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => void WebBrowser.openBrowserAsync(a.href)}
      accessibilityRole="link"
      accessibilityLabel={`${position}: ${a.title}, ${a.source}${a.time ? `, ${a.time}` : ''}`}
      accessibilityHint="Öffnet den Artikel im Browser"
      style={styles.slide}
    >
      <NewsMeta source={a.source} time={a.time} />
      <Text style={[styles.headline, { color: theme.text }]} numberOfLines={3}>
        {a.title}
      </Text>
    </Pressable>
  );
});

/** Pause/Weiter — WCAG 2.2.2. `memo`: ändert sich nur, wenn jemand ihn drückt. */
const PlayButton = memo(function PlayButton({
  playing,
  onToggle,
}: {
  playing: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Durchwechseln anhalten' : 'Durchwechseln fortsetzen'}
      style={styles.play}
    >
      <Ionicons name={playing ? 'pause' : 'play'} size={18} color={theme.textSecondary} />
    </Pressable>
  );
});

/**
 * Folien, Punkte und Pause-Knopf. Der Folienstand liegt in {@link SlideStack}, unter
 * diesem Kind-Teil statt im Slider: Titel und Karte rendern beim Wechsel nicht mit.
 */
function SliderBody({ items }: { items: DashboardArticle[] }) {
  const slides = useMemo<Slide[]>(
    () =>
      items.map((a, i) => {
        const position = `Meldung ${i + 1} von ${items.length}`;
        return {
          key: a.key,
          label: position,
          announce: a.title,
          content: <HeadlineSlide article={a} position={position} />,
        };
      }),
    [items]
  );
  return (
    <SlideStack
      slides={slides}
      intervalMs={SLIDE_INTERVAL_MS}
      footerStyle={styles.footer}
      renderControls={({ playing, togglePlaying }) => (
        <View style={styles.controls}>
          <PlayButton playing={playing} onToggle={togglePlaying} />
        </View>
      )}
    />
  );
}

export function HeadlineSlider({
  items,
  loading,
  error,
  onRetry,
  onOpenBriefing,
}: {
  items: DashboardArticle[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpenBriefing: () => void;
}) {
  const theme = useTheme();
  if (items.length === 0) {
    return (
      <SliderCard accessibilityLabel={SLIDER_TITLE} aria-busy={loading}>
        <SliderTitle onPress={onOpenBriefing} />
        {loading ? (
          <SliderSkeleton />
        ) : error ? (
          <View style={styles.message}>
            <CardError onRetry={onRetry} />
          </View>
        ) : (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>{EMPTY_TEXT}</Text>
        )}
      </SliderCard>
    );
  }

  return (
    <SliderCard accessibilityLabel={SLIDER_TITLE}>
      <SliderTitle onPress={onOpenBriefing} />
      <SliderBody items={items} />
      {error ? (
        <View style={styles.message}>
          <CardError onRetry={onRetry} />
        </View>
      ) : null}
    </SliderCard>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 18, paddingTop: 18 },
  slide: { gap: 6, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 },
  headline: { fontFamily: HEADING_FONT_BOLD, fontSize: 19, lineHeight: 24 },
  footer: { paddingHorizontal: 6, paddingBottom: 4 },
  controls: { marginLeft: 'auto' },
  play: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  message: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18 },
  empty: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
});
