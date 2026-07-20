import { type Slide } from '@gruenerator/contracts';
import { useState } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import PagerView from 'react-native-pager-view';

import { darkTheme, lightTheme } from '../../theme';

import { SlideView } from './SlideView';

/**
 * Swipeable read-only deck: one slide per page (react-native-pager-view), with a
 * page counter. Present-mode navigation is trivial natively since reveal.js only
 * paged/transitioned on the web — the slide markup itself is what SlideView ports.
 */
export function SlideDeckView({ slides, accent }: { slides: Slide[]; accent?: string | null }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [page, setPage] = useState(0);

  const visible = slides.filter((s) => !s.hidden);

  if (visible.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Diese Präsentation hat keine Folien.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <PagerView
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        {visible.map((slide) => (
          <View key={slide.id} style={styles.page}>
            <SlideView slide={slide} accent={accent} />
          </View>
        ))}
      </PagerView>
      <View style={[styles.counter, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.counterText, { color: theme.textSecondary }]}>
          {page + 1} / {visible.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pager: { flex: 1 },
  page: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  counter: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  counterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
  },
});
