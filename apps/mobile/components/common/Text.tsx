import { Text as RNText, StyleSheet, type TextStyle } from 'react-native';

import { BODY_FONT, BODY_FONT_BOLD } from '../../theme/typography';

type RNTextProps = React.ComponentProps<typeof RNText>;

const BOLD_WEIGHTS = new Set(['600', '700', '800', '900', 'bold']);

/**
 * `Text` with the app's body font already on it. Import this instead of
 * `react-native`'s — every screen does, so the app has one body face.
 *
 * A wrapper rather than a global default because React Native offers no such
 * default and the two tricks that used to fake one are both dead: `Text` is a
 * plain function component in RN 0.86 (`Libraries/Text/Text.js`), so there is no
 * `.render` to patch, and React 19 dropped `defaultProps` for function
 * components.
 *
 * It also translates weight into family. PT Sans ships as two files here,
 * Regular and Bold, and a custom family does not synthesise weights on Android:
 * `fontWeight: '700'` next to `fontFamily: 'PTSans-Regular'` renders plain
 * regular. So a bold weight picks the Bold family instead and the weight is
 * dropped — which lets the ~320 existing `{ fontSize, fontWeight }` styles keep
 * working untouched.
 *
 * An explicit `fontFamily` in the passed style always wins (headings on
 * Raleway, the monospace of the subtitle export screen).
 */
export function Text({ style, ...rest }: RNTextProps) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (flat?.fontFamily) return <RNText style={style} {...rest} />;

  const { fontWeight, ...restStyle } = flat ?? {};
  const fontFamily =
    fontWeight && BOLD_WEIGHTS.has(String(fontWeight)) ? BODY_FONT_BOLD : BODY_FONT;
  return <RNText {...rest} style={[{ fontFamily }, restStyle]} />;
}
