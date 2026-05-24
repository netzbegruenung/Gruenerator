import { getToolMeta, getToolQuery, parseExamples } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius } from '../../../theme';

import { toolIonicon } from './toolIcons';

import type { Theme } from '../../../theme/colors';

interface ToolCallPart {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

// Native counterpart of web's CompactExampleResults (gruenerator_examples_search):
// a tappable pill that expands to platform-tagged content snippets. These
// results carry no URLs, so they render as text snippets rather than citations.
export function ExampleResultsCard({ part, theme }: { part: ToolCallPart; theme: Theme }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getToolMeta(part.toolName);
  const query = getToolQuery(part.args);

  const examples = useMemo(() => parseExamples(part.result), [part.result]);
  const count = examples.length;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => count > 0 && setExpanded((x) => !x)}
        style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Ionicons name={toolIonicon(meta.iconKey)} size={14} color={colors.secondary[600]} />
        <Text style={[styles.label, { color: theme.text }]}>{meta.label}</Text>
        {query && (
          <Text style={[styles.query, { color: theme.textSecondary }]} numberOfLines={1}>
            „{query}"
          </Text>
        )}
        {count > 0 && (
          <>
            <Text style={[styles.count, { color: colors.primary[600] }]}>{count}</Text>
            <Ionicons
              name={expanded ? 'chevron-down' : 'chevron-forward'}
              size={14}
              color={theme.textSecondary}
            />
          </>
        )}
      </Pressable>

      {expanded && count > 0 && (
        <View style={[styles.results, { borderLeftColor: theme.border }]}>
          {examples.slice(0, 5).map((ex, i) => (
            <View key={i} style={styles.example}>
              {ex.platform && (
                <Text style={[styles.platform, { color: colors.secondary[700] }]}>
                  {ex.platform}
                </Text>
              )}
              {ex.content && (
                <Text style={[styles.content, { color: theme.textSecondary }]} numberOfLines={3}>
                  {ex.content}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xsmall,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  query: {
    flexShrink: 1,
    fontSize: 12,
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
  },
  results: {
    marginTop: spacing.xsmall,
    marginLeft: spacing.xsmall,
    paddingLeft: spacing.small,
    borderLeftWidth: 2,
    gap: spacing.xsmall,
  },
  example: {
    gap: 2,
  },
  platform: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  content: {
    fontSize: 12,
    lineHeight: 17,
  },
});
