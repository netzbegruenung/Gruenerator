import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { colors } from '../../../theme';

const GAP = 12;
/** Narrower than the screen, so the next slide peeks in. */
const SIDE_INSET = 80;
const MAX_SLIDE_WIDTH = 420;
/** The creator's usual format; the picture is drawn with `contain` inside it. */
const ASPECT = 4 / 5;

interface SlideCarouselProps {
  images: string[];
  /** A design choice is being drawn: the slides on screen are about to change. */
  busy: boolean;
  /** Holding a slide opens what can be done with the design. */
  onLongPress?: () => void;
}

/** The slides of one design, swiped horizontally, with a page indicator. */
export function SlideCarousel({ images, busy, onLongPress }: SlideCarouselProps) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(screenWidth - SIDE_INSET, MAX_SLIDE_WIDTH);
  const [scrolled, setScrolled] = useState(0);
  // A design choice can drop a slide; the indicator must not point past the end.
  const active = Math.min(scrolled, images.length - 1);
  const step = width + GAP;

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / step);
      setScrolled(Math.max(0, Math.min(images.length - 1, index)));
    },
    [step, images.length]
  );

  return (
    <View style={styles.wrap}>
      <View>
        <FlatList
          data={images}
          keyExtractor={(_, index) => String(index)}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={32}
          ItemSeparatorComponent={Separator}
          renderItem={({ item, index }) => (
            <Pressable
              onLongPress={onLongPress}
              disabled={!onLongPress}
              style={[
                styles.slide,
                { width, backgroundColor: theme.surface, borderColor: theme.border },
              ]}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Slide ${index + 1} von ${images.length}`}
              accessibilityHint={onLongPress ? 'Gedrückt halten für Optionen' : undefined}
              accessibilityActions={onLongPress ? [{ name: 'longpress' }] : undefined}
              onAccessibilityAction={onLongPress}
            >
              <Image source={{ uri: item }} style={styles.image} contentFit="contain" />
            </Pressable>
          )}
        />
        {busy && (
          <View style={styles.busy} pointerEvents="none">
            <ActivityIndicator color={colors.white} />
          </View>
        )}
      </View>
      {images.length > 1 && (
        <View style={styles.dots} importantForAccessibility="no-hide-descendants">
          {images.map((_, index) => (
            <View
              // eslint-disable-next-line react/no-array-index-key -- a dot IS a slide position; slides have no other identity
              key={index}
              style={[
                styles.dot,
                index === active
                  ? { width: 18, backgroundColor: colors.primary[600] }
                  : { backgroundColor: theme.textSecondary, opacity: 0.35 },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Separator() {
  return <View style={{ width: GAP }} />;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  slide: { aspectRatio: ASPECT, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  busy: {
    position: 'absolute',
    top: 8,
    left: 8,
    padding: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
