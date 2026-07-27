import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';

import { copyToClipboard } from '../../../services/share';
import { colors, spacing, borderRadius, chatType } from '../../../theme';

import { highlightCode, normalizeLanguage, type TokenKind } from './highlightCode';

import type { Theme } from '../../../theme/colors';

/** The label shown in the header, by family. `plain` shows nothing. */
const LANGUAGE_LABEL: Record<string, string> = {
  js: 'JavaScript',
  python: 'Python',
  json: 'JSON',
  shell: 'Shell',
  sql: 'SQL',
};

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * Token colours. Deliberately few: on a phone the block is small and a full
 * palette reads as noise. Comments recede, strings and numbers carry the accent,
 * keywords carry weight rather than a third hue.
 */
function tokenStyle(kind: TokenKind, theme: Theme) {
  switch (kind) {
    case 'comment':
      return { color: theme.textSecondary, fontStyle: 'italic' as const };
    case 'string':
      return { color: colors.primary[500] };
    case 'number':
      return { color: colors.semantic.info };
    case 'keyword':
      return { color: theme.text, fontWeight: '700' as const };
    default:
      return { color: theme.text };
  }
}

/**
 * A fenced code block: language label, copy button, and horizontally scrollable
 * highlighted source.
 *
 * Before this the fence rendered as one wrapped grey paragraph — indentation
 * lost to wrapping, no way to get the code out of the app. The horizontal
 * scroll is the part that matters most on a phone: wrapped code is unreadable
 * code.
 */
export const CodeBlock = memo(function CodeBlock({
  code,
  info,
  theme,
}: {
  code: string;
  info: string | undefined;
  theme: Theme;
}) {
  const [copied, setCopied] = useState(false);
  const language = normalizeLanguage(info);
  const tokens = useMemo(() => highlightCode(code, language), [code, language]);
  const label = LANGUAGE_LABEL[language];

  const handleCopy = useCallback(() => {
    void copyToClipboard(code).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <View style={[styles.block, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.language, { color: theme.textSecondary }]}>{label ?? 'Code'}</Text>
        <Pressable onPress={handleCopy} hitSlop={8} accessibilityLabel="Code kopieren">
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={15}
            color={copied ? colors.primary[500] : theme.textSecondary}
          />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.codeContent}
      >
        <Text style={styles.code} selectable>
          {tokens.map((token, index) => (
            <Text key={index} style={tokenStyle(token.kind, theme)}>
              {token.text}
            </Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  block: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.medium,
    marginVertical: spacing.xsmall,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  language: {
    ...chatType.chatMicro,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  codeContent: {
    padding: spacing.small,
  },
  code: {
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: 19,
  },
});
