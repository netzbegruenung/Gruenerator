import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../theme';

/** A hue pair from `officeTypeColor` / `getToolTheme` — pastel field, dark glyph. */
export interface EmptyStateTone {
  tile: string;
  icon: string;
}

/** `tile`/`icon` are colours (as in `ToolTheme`); `glyph` is the Ionicons name. */
export interface EmptyStateTile extends EmptyStateTone {
  glyph: IoniconsIconName;
}

export interface EmptyStateAction {
  key: string;
  glyph: IoniconsIconName;
  title: string;
  description: string;
  tone: EmptyStateTone;
  onPress: () => void;
}

/**
 * The "nothing here yet" screen for a content tab.
 *
 * Two decisions worth keeping:
 *
 * The motif is a fanned stack of the tab's own card shapes, tinted with the very
 * hues the filled tab uses — `OFFICE_TYPE_COLORS` on Arbeiten, the tool palette
 * on Studio. So it previews what will stand there rather than showing a grey
 * outline icon that says the same thing on every screen.
 *
 * The actions are the point. An empty tab is where someone has the least idea
 * what to do next, and a lone "Erstelle etwas, um loszulegen" answers that with
 * a restatement. Every row here starts a real flow, and they have to differ from
 * one another — three rows opening the same sheet is a fake choice.
 */
export function EmptyState({
  tiles,
  title,
  description,
  actions,
  style,
}: {
  /** The fanned stack, middle one raised. Three reads best; any count works. */
  tiles: EmptyStateTile[];
  title: string;
  description: string;
  actions?: EmptyStateAction[];
  style?: StyleProp<ViewStyle>;
}) {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const middle = Math.floor(tiles.length / 2);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.stack}>
        {tiles.map((tile, i) => {
          const isMiddle = i === middle;
          return (
            <View
              key={`${tile.glyph}-${tile.tile}`}
              style={[
                styles.tile,
                isMiddle ? styles.tileMiddle : styles.tileSide,
                {
                  backgroundColor: tile.tile,
                  borderColor: theme.cardBorder,
                  transform: [{ rotate: isMiddle ? '0deg' : i < middle ? '-9deg' : '9deg' }],
                },
              ]}
            >
              <Ionicons name={tile.glyph} size={isMiddle ? 28 : 22} color={tile.icon} />
            </View>
          );
        })}
      </View>

      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>

      {actions && actions.length > 0 && (
        <View
          style={[styles.actions, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
        >
          {actions.map((action, i) => (
            <Pressable
              key={action.key}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.title}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                pressed && { backgroundColor: theme.surface },
              ]}
            >
              <View style={[styles.rowTile, { backgroundColor: action.tone.tile }]}>
                <Ionicons name={action.glyph} size={20} color={action.tone.icon} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                  {action.title}
                </Text>
                <Text style={[styles.rowDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                  {action.description}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.xlarge,
  },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.large,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.large,
    borderWidth: StyleSheet.hairlineWidth,
    // Negative margin, not gap: the tiles overlap into a fan instead of sitting
    // in a row that happens to be tilted.
    marginHorizontal: -8,
  },
  tileSide: {
    width: 56,
    height: 70,
  },
  tileMiddle: {
    width: 64,
    height: 80,
    // Draws over both neighbours; without it the overlap stacks the wrong way.
    zIndex: 1,
  },
  title: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 19,
    textAlign: 'center',
  },
  description: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xsmall,
    maxWidth: 300,
  },
  actions: {
    width: '100%',
    maxWidth: 360,
    marginTop: spacing.large,
    borderRadius: borderRadius.xlarge,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.small,
  },
  rowTile: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '600',
  },
  rowDesc: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    marginTop: 1,
  },
});
