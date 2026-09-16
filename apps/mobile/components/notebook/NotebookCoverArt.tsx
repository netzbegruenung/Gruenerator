import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { spacing } from '../../theme';

/**
 * Branded cover art for notebooks that have no designed webp — i.e. everything a
 * user created. Mobile port of web's `NotebookCoverArt`
 * (apps/web/src/features/notebook/components/NotebookCoverArt.tsx): the same
 * pink→lilac gradient with a soft bloom at the bottom and the name set white,
 * top-left, so an arbitrary notebook name gets the same tile as a shipped cover.
 *
 * The colours are sampled from notebook-neu.webp at 0/30/55/78/100 % and are
 * copied from web deliberately — they are the design, not a theme token, and
 * they stay identical in dark mode because the webp covers beside them cannot
 * react to the theme either.
 *
 * Two things differ from web, both forced:
 *
 * - The type is Raleway, not GrueneType. The brand face ships as woff/woff2
 *   only (apps/web/src/assets/fonts/), which React Native cannot load; Raleway
 *   is what the rest of this screen's headings already use.
 * - Sizes are a share of `size` rather than `cqw`, because container queries
 *   have no RN equivalent. Same ratios, same steps.
 */
const STOPS = [
  { offset: '0', color: '#c1447a' },
  { offset: '0.3', color: '#c85684' },
  { offset: '0.55', color: '#c4728f' },
  { offset: '0.78', color: '#c095a8' },
  { offset: '1', color: '#cdb3bf' },
] as const;

/** Share of the tile's edge, matching web's `cqw` steps. */
const TITLE_RATIOS = { xl: 0.17, lg: 0.14, md: 0.11, sm: 0.086 } as const;
const SUBTITLE_RATIO = 0.054;

/** Where the title box ends — web's `bottom: 24%`, above the subtitle line. */
const TITLE_BOTTOM = 0.76;

/**
 * Pick the step that lets the name breathe: short names get poster-sized type,
 * long ones step down. A very long single word (German compounds) is capped at
 * `md` — RN does not hyphenate, so an oversized compound would otherwise be
 * clipped mid-word.
 */
function titleRatio(title: string): number {
  const longestWord = title.split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0);
  if (longestWord >= 16) return TITLE_RATIOS[title.length > 40 ? 'sm' : 'md'];
  if (title.length <= 13) return TITLE_RATIOS.xl;
  if (title.length <= 22) return TITLE_RATIOS.lg;
  if (title.length <= 40) return TITLE_RATIOS.md;
  return TITLE_RATIOS.sm;
}

export function NotebookCoverArt({
  title,
  subtitle,
  size,
  /**
   * Set while the tile carries a top-right control (the like button, the
   * indexing spinner). The title then starts below it instead of running
   * underneath — there is no float in RN, so it costs a line rather than a
   * corner. Pass the same condition that renders the control, not `true`.
   */
  reserveTopRight,
}: {
  title: string;
  subtitle?: string;
  /** Edge length of the tile, from `useNotebookTileGrid`. */
  size: number;
  reserveTopRight?: boolean;
}) {
  const fontSize = Math.round(size * titleRatio(title));
  // Web's title box is `top: 8%` / `bottom: 24%`. Reserving the corner moves the
  // top down; the bottom must stay put, or a long name grows past 76% and runs
  // into the subtitle instead of being clipped above it.
  const titleTop = reserveTopRight ? 0.2 : 0.08;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="coverBase" x1="0" y1="0" x2="0.052" y2="1">
            {STOPS.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </LinearGradient>
          <RadialGradient id="coverBloom" cx="30%" cy="106%" rx="57%" ry="40%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#coverBase)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#coverBloom)" />
      </Svg>

      <Text
        style={[
          styles.title,
          {
            fontSize,
            lineHeight: Math.round(fontSize * 1.1),
            top: size * titleTop,
            left: size * 0.1,
            right: size * 0.07,
          },
        ]}
        // The box is what clips, as on web — a tall name is cut off rather than
        // shrunk, so every tile in the grid keeps one type scale.
        numberOfLines={Math.max(
          1,
          Math.floor((size * (TITLE_BOTTOM - titleTop)) / (fontSize * 1.1))
        )}
      >
        {title}
      </Text>

      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            { fontSize: Math.round(size * SUBTITLE_RATIO), left: size * 0.1, right: size * 0.07 },
          ]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    position: 'absolute',
    fontFamily: 'Raleway_700Bold',
    color: '#ffffff',
  },
  subtitle: {
    position: 'absolute',
    bottom: spacing.xsmall,
    fontFamily: 'Raleway_700Bold',
    color: 'rgba(255,255,255,0.9)',
  },
});
