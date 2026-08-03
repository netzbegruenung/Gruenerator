import { type SerializableCitation } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BODY_FONT, chatType, spacing } from '../../theme';

import { ToolCitationList } from './tool-ui/ToolCitationList';

import type { Theme } from '../../theme/colors';

interface StatusLineDetailsProps {
  /** The shimmering status line — rendered as-is, never restyled here. */
  children: ReactNode;
  reasoningText: string | null;
  sources: ReadonlyArray<SerializableCitation>;
  theme: Theme;
}

/** Reasoning is long; the panel scrolls rather than pushing the answer offscreen. */
const MAX_PANEL_HEIGHT = 200;

/**
 * Native twin of web's `StatusLineDetails`: a chevron NEXT to the shimmering
 * line that opens the model's thinking and the sources found so far.
 *
 * Stream-only by design — reasoning is never persisted and the sources reappear
 * in the Quellen-Footer, so the whole affordance retires with the line once the
 * answer text starts.
 */
export function StatusLineDetails({
  children,
  reasoningText,
  sources,
  theme,
}: StatusLineDetailsProps) {
  const [open, setOpen] = useState(false);

  if (!reasoningText && sources.length === 0) return <>{children}</>;

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.line}>{children}</View>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? 'Details ausblenden' : 'Details anzeigen'}
          hitSlop={8}
          style={styles.toggle}
        >
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={theme.textSecondary}
          />
        </Pressable>
      </View>

      {open && (
        <View style={[styles.panel, { borderLeftColor: theme.border }]}>
          {reasoningText ? (
            <View style={styles.section}>
              <Text style={[styles.heading, { color: theme.textSecondary }]}>
                Grünerators Gedanken
              </Text>
              <ScrollView style={styles.scroll} nestedScrollEnabled>
                <Text style={[styles.reasoning, { color: theme.textSecondary }]}>
                  {reasoningText}
                </Text>
              </ScrollView>
            </View>
          ) : null}

          {sources.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.heading, { color: theme.textSecondary }]}>
                Gefundene Quellen ({sources.length})
              </Text>
              <ToolCitationList citations={sources as SerializableCitation[]} theme={theme} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
  },
  line: {
    flexShrink: 1,
  },
  toggle: {
    paddingHorizontal: spacing.xxsmall,
  },
  panel: {
    marginLeft: spacing.xsmall,
    paddingLeft: spacing.small,
    borderLeftWidth: 2,
    gap: spacing.small,
  },
  section: {
    gap: spacing.xxsmall,
  },
  heading: {
    ...chatType.chatMicro,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
  scroll: {
    maxHeight: MAX_PANEL_HEIGHT,
  },
  reasoning: {
    ...chatType.chatSecondary,
  },
});
