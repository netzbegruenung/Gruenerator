import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  StyleSheet,
  View,
  useColorScheme,
  type NativeSyntheticEvent,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import Animated, {
  useAnimatedStyle,
  useEvent,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { SunriseBackground } from '../common/SunriseBackground';
import { ScreenScaffold } from '../navigation/ScreenScaffold';
import { WORKPLACE_TABS, WorkplaceTopTabs } from '../navigation/WorkplaceTopTabs';

import { WorkplaceArbeitenPage } from './WorkplaceArbeitenPage';
import { WorkplaceChatPage } from './WorkplaceChatPage';

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

const ARBEITEN = 1;

type PageScrollEvent = NativeSyntheticEvent<{ position: number; offset: number }>;

/**
 * The pager's live position (page index plus fraction) into a shared value, on
 * the UI thread. Reanimated hands the worklet the unwrapped native payload.
 */
function usePagerProgress(progress: SharedValue<number>) {
  return useEvent<PageScrollEvent>(
    (e) => {
      'worklet';
      progress.set(e.position + e.offset);
    },
    ['onPageScroll']
  );
}

/** The page a link asks for: `/start?page=arbeiten`. */
function pageFromParam(page: string | string[] | undefined) {
  return page === 'arbeiten' ? ARBEITEN : page === 'chat' ? 0 : null;
}

/**
 * The workplace shell's Chat | Arbeiten as one native pager (ViewPager2 on
 * Android, a paging UIScrollView on iOS): the pages follow the finger, a
 * half-finished drag springs back or completes with the finger's speed, and a
 * horizontal list inside a page scrolls before the pager takes over — all the
 * platform's own paging, not a swipe that switches screens once it ends.
 *
 * The header stays put; only its thumb moves, and the backdrop crossfades from
 * Chat's sunrise to Arbeiten's flat tint. Both are driven by `progress` on the
 * UI thread, so a swipe renders nothing in React.
 *
 * Arbeiten is the heavy page (four queries, a long list); it mounts once the
 * Chat page is on screen, or immediately when a drag or a link asks for it.
 *
 * Both pages live in the `start` route; `/(tabs)/(arbeiten)` redirects here
 * with `?page=arbeiten`, so deep links and `router.replace` to it still land.
 */
export function WorkplacePager() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { page: pageParam } = useLocalSearchParams<{ page?: string }>();
  const pagerRef = useRef<PagerView>(null);

  const requested = pageFromParam(pageParam);
  const [initialPage] = useState(requested ?? 0);
  const [page, setPage] = useState(initialPage);
  const [arbeitenMounted, setArbeitenMounted] = useState(initialPage === ARBEITEN);
  const progress = useSharedValue(initialPage);
  const onPageScroll = usePagerProgress(progress);

  useEffect(() => {
    if (arbeitenMounted) return;
    const handle = requestIdleCallback(() => setArbeitenMounted(true));
    return () => cancelIdleCallback(handle);
  }, [arbeitenMounted]);

  // A link into a page; the param is cleared so the same link works again
  // after the user has swiped away.
  // Adjusted during render rather than in the effect, so the page is there in
  // the same commit the pager is told to show it.
  if (requested !== null && !arbeitenMounted) setArbeitenMounted(true);
  useEffect(() => {
    if (requested === null) return;
    pagerRef.current?.setPage(requested);
    router.setParams({ page: undefined });
  }, [requested, router]);

  // Android back on Arbeiten goes to Chat, as the tab history did.
  useFocusEffect(
    useCallback(() => {
      if (page === 0) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        pagerRef.current?.setPage(0);
        return true;
      });
      return () => sub.remove();
    }, [page])
  );

  const selectPage = useCallback((index: number) => {
    setArbeitenMounted(true);
    pagerRef.current?.setPage(index);
  }, []);

  const flatStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const backdrop = (
    <>
      <SunriseBackground />
      {!isDark && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.flatBg, flatStyle]}
        />
      )}
    </>
  );

  return (
    <ScreenScaffold
      title={WORKPLACE_TABS[page]?.label ?? 'Chat'}
      titleNode={
        <WorkplaceTopTabs
          progress={progress}
          active={WORKPLACE_TABS[page]?.id ?? 'chat'}
          onSelect={selectPage}
        />
      }
      backdrop={backdrop}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AnimatedPagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={initialPage}
        overdrag={false}
        keyboardDismissMode="on-drag"
        onPageScroll={onPageScroll}
        onPageScrollStateChanged={(e) => {
          if (e.nativeEvent.pageScrollState === 'dragging') setArbeitenMounted(true);
        }}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        <View key="chat" style={styles.page}>
          <WorkplaceChatPage />
        </View>
        <View key="arbeiten" style={styles.page}>
          {arbeitenMounted && <WorkplaceArbeitenPage />}
        </View>
      </AnimatedPagerView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  flatBg: {
    backgroundColor: '#F7FBF8',
  },
});
