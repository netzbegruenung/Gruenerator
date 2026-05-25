import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';

// Shared react-native-markdown-display style map for assistant text. Used by the
// message bubble and the research artifact card so AI markdown renders alike.
export function getMarkdownStyles(theme: Theme) {
  return {
    body: {
      color: theme.text,
      fontSize: 16,
      lineHeight: 25,
    },
    heading1: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '700' as const,
      marginBottom: spacing.xsmall,
    },
    heading2: {
      color: theme.text,
      fontSize: 19,
      fontWeight: '600' as const,
      marginBottom: spacing.xsmall,
    },
    heading3: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '600' as const,
      marginBottom: spacing.xxsmall,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: spacing.small,
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
      fontSize: 13,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    fence: {
      backgroundColor: theme.surface,
      color: theme.text,
      fontSize: 13,
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
