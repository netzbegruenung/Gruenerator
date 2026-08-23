import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { spacing, lightTheme, darkTheme } from '../../theme';
import { LoginPanel } from '../auth/LoginPanel';
import { Button } from '../common';

/**
 * The last page of the carousel: the question, and the way in.
 *
 * The sign-in lives on the slide rather than behind a "Anmelden" button that
 * pushes the login screen. A person who has just swiped through five pages of
 * what the app does should not have to arrive at a sixth screen making the same
 * promise again — the login screen still exists for everyone who comes back
 * after a logout, and both wear the same {@link LoginPanel}.
 *
 * The replay case is the exception: settings can send an already-signed-in
 * person back through the carousel, and asking them to sign in at the end of it
 * would be nonsense. They get a plain "Fertig" instead.
 */
export function OnboardingFinale({
  index,
  progress,
  signedIn,
  onDone,
}: {
  index: number;
  progress: SharedValue<number>;
  signedIn: boolean;
  onDone: () => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  // Same fade-and-slide the other pages' text uses, so the last page arrives
  // like the ones before it rather than snapping in.
  const enter = useAnimatedStyle(() => {
    const d = progress.value - index;
    return {
      opacity: interpolate(Math.abs(d), [0, 0.5], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(d, [-1, 0, 1], [90, 0, -90], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={styles.slide}>
      <Animated.View style={[styles.inner, enter]}>
        <Text style={[styles.title, { color: theme.text }]}>Bereit?</Text>

        {signedIn ? (
          <Button onPress={onDone} style={styles.done}>
            Login
          </Button>
        ) : (
          <LoginPanel onSuccess={onDone} />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.large,
  },
  inner: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.small,
  },
  title: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 34,
    textAlign: 'center',
    marginBottom: spacing.medium,
  },
  done: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
  },
});
