import { StyleSheet, View, useColorScheme } from 'react-native';

import { darkTheme, typeScale } from '../../theme';
import { COMPOSER_GLOW, COMPOSER_GLOW_HEIGHT } from '../../theme/chatBackgrounds';
import { MeshSurface } from '../common/MeshSurface';

/** The sunrise's cream base without its gold glow — the chat page tint. */
const CHAT_VANILLA = '#FEFCF5';

/**
 * The conversation backdrop: vanilla page plus the composer glow. Vanilla, not
 * the tab's sunrise: the gold glow read as yellow behind a wall of message
 * bubbles. Every chat-shaped surface wears it, so a conversation looks like one
 * wherever it happens.
 */
export function ChatBackdrop() {
  const isDark = useColorScheme() === 'dark';
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? darkTheme.background : CHAT_VANILLA },
        ]}
      />
      <MeshSurface
        mesh={COMPOSER_GLOW}
        id="composer-glow"
        style={styles.composerGlow}
        followsKeyboard
        hideInDark
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Bottom-anchored band rather than the whole screen: the glow belongs to the
  // composer, and behind a wall of message bubbles the same colour costs
  // legibility. A `StyleSheet` entry and not an inline object — `MeshSurface` is
  // memoized, and a fresh object each render would defeat that.
  composerGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: typeScale(COMPOSER_GLOW_HEIGHT),
  },
});
