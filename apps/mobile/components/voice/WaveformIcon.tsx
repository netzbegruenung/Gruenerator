import Svg, { Line } from 'react-native-svg';

/** Four sound-wave bars: the voice-call glyph, which Ionicons lacks. */
export function WaveformIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {[
        [4, 10, 14],
        [9, 6, 18],
        [14, 8, 16],
        [19, 10, 14],
      ].map(([x, y1, y2]) => (
        <Line
          key={x}
          x1={x}
          y1={y1}
          x2={x}
          y2={y2}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}
