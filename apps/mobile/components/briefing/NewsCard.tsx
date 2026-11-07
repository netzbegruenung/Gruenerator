import { type BriefingNewsList } from '@gruenerator/shared/monitor';
import * as WebBrowser from 'expo-web-browser';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useReduceMotion } from '../../hooks/useAccessibilityPreferences';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD } from '../../theme';
import { NewsMeta } from '../dashboard/NewsMeta';

import { BriefingCard, type BriefingCardState } from './BriefingCard';
import { NewsSkeleton } from './BriefingSkeleton';

/** Eingeklappt zeigt jede Nachrichtenkarte so viele Meldungen. */
const COLLAPSED = 3;

type Item = BriefingNewsList['items'][number];

/** Eine Meldung. `memo`: beim Aufklappen rendern die schon sichtbaren nicht neu. */
const NewsItem = memo(function NewsItem({ item }: { item: Item }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => void WebBrowser.openBrowserAsync(item.href)}
      accessibilityRole="link"
      accessibilityLabel={`${item.title}, ${item.source}${item.time ? `, ${item.time}` : ''}`}
      accessibilityHint="Öffnet den Artikel im Browser"
      style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
    >
      <NewsMeta source={item.source} time={item.time} />
      <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
    </Pressable>
  );
});

/** Nachrichtenkarte: Quelle · Zeit über der Schlagzeile, eingeklappt drei, offen bis zu zehn. */
export function NewsCard({
  state,
  title,
  list,
  emptyText,
}: {
  state: BriefingCardState;
  title: string;
  list: BriefingNewsList;
  emptyText: string;
}) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const always = list.items.slice(0, COLLAPSED);
  const extra = state.open ? list.items.slice(COLLAPSED) : [];

  return (
    <BriefingCard
      state={state}
      title={title}
      busy={list.pending}
      more={list.items.length > COLLAPSED}
    >
      {list.pending ? (
        <NewsSkeleton />
      ) : list.items.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>{emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {always.map((item) => (
            <NewsItem key={item.key} item={item} />
          ))}
          {extra.map((item) => (
            <Animated.View
              key={item.key}
              entering={reduceMotion ? undefined : FadeIn.duration(200)}
              exiting={reduceMotion ? undefined : FadeOut.duration(150)}
            >
              <NewsItem item={item} />
            </Animated.View>
          ))}
        </View>
      )}
    </BriefingCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: 26 },
  item: { gap: 6 },
  pressed: { opacity: 0.6 },
  title: { fontFamily: HEADING_FONT_BOLD, fontSize: 17, lineHeight: 22 },
  empty: { fontFamily: BODY_FONT, fontSize: 15 },
});
