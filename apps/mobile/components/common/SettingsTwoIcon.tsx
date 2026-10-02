import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Lucide's `settings-2` (ISC) — two strokes with a knob each, the settings
 * icon web's notebook composer shows (`LuSettings2`). Ionicons has only the
 * three-slider `options-outline`.
 */
export function SettingsTwoIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M14 17H5" />
      <Path d="M19 7h-9" />
      <Circle cx={17} cy={17} r={3} />
      <Circle cx={7} cy={7} r={3} />
    </Svg>
  );
}
