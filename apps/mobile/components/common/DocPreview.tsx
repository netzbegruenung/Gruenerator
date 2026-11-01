import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, spacing, lightTheme, darkTheme, BODY_FONT } from '../../theme';
import { parseDocPreview } from '../../utils/htmlExcerpt';

/**
 * Miniature document preview rendered from the doc's HTML content. Shows the first
 * heading (bold) over a body excerpt on a "paper" surface, approximating the web's
 * rich preview natively. Shared by the start-page "Zuletzt" cards and the Docs grid;
 * the caller sizes it via `style` (the surrounding card sets the aspect ratio).
 */
export function DocPreview({ content, style }: { content: string; style?: StyleProp<ViewStyle> }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const { heading, body } = useMemo(() => parseDocPreview(content), [content]);

  return (
    <View
      style={[styles.paper, { backgroundColor: isDark ? colors.grey[900] : colors.white }, style]}
    >
      {heading ? (
        <Text style={[styles.heading, { color: theme.text }]} numberOfLines={2}>
          {heading}
        </Text>
      ) : null}
      {body ? (
        <Text style={[styles.body, { color: theme.textSecondary }]} numberOfLines={heading ? 5 : 7}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // No `flex: 1`: the caller sizes the paper by width and aspect ratio. In a grid
  // row stretched by a neighbour's two-line title, flex grew the height and the
  // aspect ratio turned that into width, so the excerpt ran past the card's edge.
  paper: {
    padding: spacing.small,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  heading: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginBottom: 3,
  },
  body: {
    fontFamily: BODY_FONT,
    fontSize: 10,
    lineHeight: 14,
  },
});
