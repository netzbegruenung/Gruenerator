import { ActionBarPrimitive, useAui } from '@assistant-ui/react-native';
import { type ChatMessageMetadata } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, useCallback, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';

import { useMessageActions } from '../../../hooks/useMessageActions';
import { useNativeTTS } from '../../../hooks/useNativeTTS';
import { copyToClipboard } from '../../../services/share';
import { colors, spacing } from '../../../theme';
import { asMessageMenuId, buildMessageMenuActions } from '../menuActions';
import { MenuActionSheet } from '../MenuActionSheet';

import { flagRegenerate } from './threadRunSignals';

import type { Theme } from '../../../theme/colors';

/** Glyph size, and the invisible square around it that catches the tap. */
const ICON_SIZE = 20;
const HIT_SIZE = 40;

/**
 * Clipboard writer for ActionBarPrimitive.Copy. The primitive drives its own
 * `isCopied` state off this promise, so a failed write has to reject rather than
 * resolve — otherwise the checkmark would lie.
 */
async function writeToClipboard(text: string): Promise<void> {
  const ok = await copyToClipboard(text);
  if (!ok) throw new Error('Clipboard write failed');
}

/**
 * The icon row under each assistant reply.
 *
 * Shaped after ChatGPT: bare glyphs on the page rather than filled pills, and
 * only the actions one reaches for mid-conversation — copy, read aloud and
 * regenerate.
 * Everything that leaves the chat (Word export, editor handoff)
 * sits behind the "⋮".
 *
 * That "⋮" opens the platform's own menu, not a bottom sheet. A full-width sheet
 * sliding up from the bottom edge for two entries was the wrong weight for the
 * gesture, and it arrived a slide-animation after the tap — a native menu opens
 * at the glyph, immediately.
 */
export const AssistantActionBar = memo(function AssistantActionBar({
  theme,
  messageText,
  metadata,
}: {
  theme: Theme;
  messageText: string;
  metadata: ChatMessageMetadata;
}) {
  const aui = useAui();
  const { state: ttsState, play, stop } = useNativeTTS();
  const target = useMemo(
    () =>
      messageText
        ? { role: 'assistant', text: messageText, metadata: metadata as Record<string, unknown> }
        : null,
    [messageText, metadata]
  );
  const { exporting, exportDocx, openInDocs } = useMessageActions(target);
  const [moreOpen, setMoreOpen] = useState(false);

  // Same shape as the edit composer's Send: the run has to be flagged as a
  // regenerate before it starts, and ActionBarPrimitive.Reload takes no
  // `onPress`, so this calls the `aui.message.reload()` the primitive wraps.
  const handleReload = useCallback(() => {
    flagRegenerate();
    aui.message.reload();
  }, [aui]);

  const handleTTS = useCallback(() => {
    if (ttsState === 'playing') {
      stop();
    } else if (messageText) {
      void play(messageText);
    }
  }, [ttsState, messageText, play, stop]);

  const menuActions = useMemo(() => buildMessageMenuActions(!!exporting), [exporting]);

  const handleMenuAction = useCallback(
    (event: string) => {
      const id = asMessageMenuId(event);
      if (id === 'export-docx') void exportDocx();
      else if (id === 'open-in-docs') void openInDocs();
    },
    [exportDocx, openInDocs]
  );

  return (
    <View style={styles.bar}>
      {messageText ? (
        <ActionBarPrimitive.Copy
          copiedDuration={2000}
          copyToClipboard={writeToClipboard}
          style={styles.button}
          accessibilityLabel="Kopieren"
        >
          {({ isCopied }) => (
            <Ionicons
              name={isCopied ? 'checkmark' : 'copy-outline'}
              size={ICON_SIZE}
              color={isCopied ? colors.primary[500] : theme.textSecondary}
            />
          )}
        </ActionBarPrimitive.Copy>
      ) : null}
      <Pressable onPress={handleTTS} style={styles.button} accessibilityLabel="Vorlesen">
        <Ionicons
          name={ttsState === 'playing' ? 'stop' : 'volume-medium-outline'}
          size={ICON_SIZE}
          color={ttsState === 'playing' ? colors.primary[500] : theme.textSecondary}
        />
      </Pressable>
      <Pressable
        onPress={handleReload}
        testID="chat-message-reload"
        style={styles.button}
        accessibilityLabel="Neu generieren"
      >
        <Ionicons name="refresh-outline" size={ICON_SIZE} color={theme.textSecondary} />
      </Pressable>
      {messageText ? (
        <Pressable
          onPress={() => setMoreOpen(true)}
          style={styles.button}
          testID="chat-message-more"
          accessibilityLabel="Weitere Optionen"
        >
          <Ionicons
            name={exporting ? 'hourglass-outline' : 'ellipsis-vertical'}
            size={ICON_SIZE}
            color={theme.textSecondary}
          />
        </Pressable>
      ) : null}
      {/* Same reason as the drawer rows: `MenuView` did not render on the
          device. See MenuActionSheet. */}
      <MenuActionSheet
        visible={moreOpen}
        theme={theme}
        actions={menuActions}
        onSelect={handleMenuAction}
        onClose={() => setMoreOpen(false)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    marginTop: spacing.xsmall,
    // Pull the row back by the padding inside the first hit box so the leading
    // glyph lines up with the text above it rather than sitting indented.
    marginLeft: -(HIT_SIZE - ICON_SIZE) / 2,
  },
  button: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
