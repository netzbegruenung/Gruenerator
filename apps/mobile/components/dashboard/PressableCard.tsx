import { memo, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { useReduceMotion } from '../../hooks/useAccessibilityPreferences';

/**
 * Karte oder Kachel mit Druck-Rückmeldung: beim Drücken auf 0,97 in 120 ms
 * (Reanimated-CSS-Transition, läuft auf dem UI-Thread). Der Druckzustand liegt im
 * Kind, ein Druck rendert also nur diese Kachel. Bei „Bewegung reduzieren“ bleibt
 * es beim Drücken ohne Skalierung.
 *
 */
export const PressableCard = memo(function PressableCard({
  style,
  containerStyle,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  /** Aussehen der inneren Fläche. */
  style?: StyleProp<ViewStyle>;
  /** Platz in der Umgebung (Breite, Flex) — gilt für die Zielfläche. */
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReduceMotion();
  return (
    <Pressable
      {...rest}
      style={containerStyle}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
    >
      <Animated.View
        style={[
          style,
          styles.fill,
          {
            transform: [{ scale: pressed && !reduceMotion ? 0.97 : 1 }],
            transitionProperty: 'transform',
            transitionDuration: 120,
            transitionTimingFunction: 'ease-out',
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // Die Fläche füllt die Zielfläche, auch wenn die Reihe sie höher zieht.
  fill: { flexGrow: 1 },
});
