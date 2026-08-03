import { colors, spacing, borderRadius, BODY_FONT, chatType, typeScale } from '../../theme';

import type { Theme } from '../../theme/colors';

// Shared react-native-markdown-display style map for assistant text. Used by the
// message bubble and the research artifact card so AI markdown renders alike.
//
// The answer body IS the conversation, so it takes `chatBody` straight from the
// scale rather than repeating its numbers. The headings and code have no tier
// of their own — markdown is the only surface that renders them — so they go
// through `typeScale` directly, which at least keeps them moving with the
// handset instead of being fixed to the one they were fitted on.
export function getMarkdownStyles(theme: Theme) {
  return {
    body: {
      color: theme.text,
      ...chatType.chatBody,
    },
    heading1: {
      color: theme.text,
      fontFamily: BODY_FONT,
      fontSize: typeScale(24),
      fontWeight: '700' as const,
      marginBottom: spacing.xsmall,
    },
    heading2: {
      color: theme.text,
      fontFamily: BODY_FONT,
      fontSize: typeScale(20),
      fontWeight: '600' as const,
      marginBottom: spacing.xsmall,
    },
    heading3: {
      color: theme.text,
      fontFamily: BODY_FONT,
      fontSize: typeScale(18),
      fontWeight: '600' as const,
      marginBottom: spacing.xxsmall,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: spacing.medium,
    },
    link: {
      color: theme.link,
    },
    blockquote: {
      backgroundColor: theme.surface,
      borderLeftColor: colors.primary[600],
      borderLeftWidth: 3,
      paddingHorizontal: spacing.small,
      paddingVertical: spacing.xsmall,
    },
    code_inline: {
      backgroundColor: theme.surface,
      color: theme.text,
      fontSize: typeScale(13),
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    fence: {
      backgroundColor: theme.surface,
      color: theme.text,
      fontSize: typeScale(13),
      padding: spacing.small,
      borderRadius: borderRadius.medium,
    },
    list_item: {
      marginBottom: spacing.xxsmall,
    },
    strong: {
      fontWeight: '600' as const,
    },
  };
}
