import { grueneratorHomeIconGeometry as geo } from '@gruenerator/chat';
import { useEffect } from 'react';
import { type ColorValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg';

import { colors } from '../../theme';

// Native counterpart of web's GrueneratorHomeIconLoading. The path geometry is
// shared (@gruenerator/chat grueneratorHomeIconGeometry); only the animation
// engine differs — web uses CSS @keyframes, here reanimated drives the cog
// rotation and the dot pulse (react-native-svg can't run CSS animations).

const {
  GEAR_BODY_D,
  GEAR_CENTER_DOT_D,
  BAR_D,
  GHI_GEAR_CENTER,
  GHI_DOT_X,
  GHI_DOT_Y,
  GHI_DOT_RADIUS,
  GHI_VIEWBOX,
  GHI_CLIP_CIRCLE_D,
  GHI_CLIP_GEAR_D,
  GHI_BAR_TRANSLATE,
  GHI_DOT_CYCLE_S,
  GHI_DOT_STAGGER_S,
  GHI_DOT_PULSE_TRAVEL,
  GHI_COG_SPIN_S,
} = geo;

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const PULSE_UP_MS = GHI_DOT_CYCLE_S * 1000 * 0.4;
const PULSE_DOWN_MS = GHI_DOT_CYCLE_S * 1000 * 0.6;

function PulsingDot({ x, index, color }: { x: number; index: number; color: ColorValue }) {
  const cy = useSharedValue(GHI_DOT_Y);

  useEffect(() => {
    cy.value = withDelay(
      index * GHI_DOT_STAGGER_S * 1000,
      withRepeat(
        withSequence(
          withTiming(GHI_DOT_Y - GHI_DOT_PULSE_TRAVEL, {
            duration: PULSE_UP_MS,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(GHI_DOT_Y, { duration: PULSE_DOWN_MS, easing: Easing.inOut(Easing.ease) })
        ),
        -1
      )
    );
  }, [cy, index]);

  const animatedProps = useAnimatedProps(() => ({ cy: cy.value }));

  return <AnimatedCircle cx={x} r={GHI_DOT_RADIUS} fill={color} animatedProps={animatedProps} />;
}

interface Props {
  size?: number;
  color?: ColorValue;
  loading?: boolean;
}

export function GrueneratorLoadingIcon({
  size = 20,
  color = colors.primary[600],
  loading = true,
}: Props) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (loading) {
      rotation.value = withRepeat(
        withTiming(360, { duration: GHI_COG_SPIN_S * 1000, easing: Easing.linear }),
        -1
      );
    } else {
      rotation.value = 0;
    }
  }, [loading, rotation]);

  const cogProps = useAnimatedProps(() => ({
    rotation: rotation.value,
    originX: GHI_GEAR_CENTER.x,
    originY: GHI_GEAR_CENTER.y,
  }));

  return (
    <Svg width={size} height={size} viewBox={GHI_VIEWBOX}>
      <Defs>
        <ClipPath id="ghi-native-clip-circle">
          <Path d={GHI_CLIP_CIRCLE_D} />
        </ClipPath>
        <ClipPath id="ghi-native-clip-gear">
          <Path d={GHI_CLIP_GEAR_D} />
        </ClipPath>
      </Defs>

      {/* Cog — slow continuous spin while loading */}
      <AnimatedG animatedProps={cogProps}>
        <G clipPath="url(#ghi-native-clip-circle)">
          <G clipPath="url(#ghi-native-clip-gear)">
            <Path d={GEAR_CENTER_DOT_D} fill={color} />
          </G>
        </G>
        <G clipPath="url(#ghi-native-clip-gear)">
          <Path d={GEAR_BODY_D} fill={color} fillRule="evenodd" />
        </G>
      </AnimatedG>

      {/* Bar — shown only when idle; the pulsing dots replace it while loading */}
      {!loading && (
        <G transform={`translate(${GHI_BAR_TRANSLATE.x}, ${GHI_BAR_TRANSLATE.y})`}>
          <Path d={BAR_D} fill={color} />
        </G>
      )}

      {/* Three dots — fade in and pulse while loading */}
      {loading && GHI_DOT_X.map((x, i) => <PulsingDot key={x} x={x} index={i} color={color} />)}
    </Svg>
  );
}
