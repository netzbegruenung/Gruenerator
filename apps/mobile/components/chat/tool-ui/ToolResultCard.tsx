import {
  getToolMeta,
  getToolQuery,
  parseSearchCitations,
  parseExampleCitations,
  parseWebCitations,
  getString,
  type SerializableCitation,
} from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius } from '../../../theme';

import { ToolCitationList } from './ToolCitationList';
import { toolIonicon } from './toolIcons';

import type { Theme } from '../../../theme/colors';

interface ToolCallPart {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

// Native counterpart of web's ToolCallUI for completed tool calls: a compact,
// tappable pill that expands to show the parsed result (search/web/example
// citations). Research has its own richer card; this handles the rest.
function citationsFor(toolName: string, result: unknown): SerializableCitation[] {
  switch (toolName) {
    case 'web_search':
      return parseWebCitations(result);
    case 'gruenerator_examples_search':
      return parseExampleCitations(result);
    case 'gruenerator_search':
    case 'search_sources':
    case 'search_user_content':
      return parseSearchCitations(result);
    default:
      return [];
  }
}

export function ToolResultCard({ part, theme }: { part: ToolCallPart; theme: Theme }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getToolMeta(part.toolName);
  const query = getToolQuery(part.args);
  const error = getString(part.result, 'error');

  const citations = useMemo(
    () => citationsFor(part.toolName, part.result),
    [part.toolName, part.result]
  );
  const count = citations.length;
  const canExpand = count > 0 && !error;
  // String-returning tools with no citations (e.g. recall_memory / save_memory)
  // surface their text result directly instead of a bare pill.
  const textResult = typeof part.result === 'string' ? part.result.trim() : null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => canExpand && setExpanded((x) => !x)}
        style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Ionicons name={toolIonicon(meta.iconKey)} size={14} color={colors.primary[500]} />
        <Text style={[styles.label, { color: theme.text }]}>{meta.label}</Text>
        {query && (
          <Text style={[styles.query, { color: theme.textSecondary }]} numberOfLines={1}>
            „{query}"
          </Text>
        )}
        {canExpand && (
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

      {error && <Text style={[styles.error, { color: colors.error[500] }]}>{error}</Text>}

      {!canExpand && !error && textResult ? (
        <Text style={[styles.note, { color: theme.textSecondary }]} numberOfLines={4}>
          {textResult}
        </Text>
      ) : null}

      {expanded && canExpand && (
        <View style={[styles.results, { borderLeftColor: theme.border }]}>
          <ToolCitationList citations={citations} theme={theme} />
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
  error: {
    fontSize: 12,
    marginTop: spacing.xxsmall,
    marginLeft: spacing.xsmall,
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xxsmall,
    marginLeft: spacing.xsmall,
  },
  results: {
    marginTop: spacing.xsmall,
    marginLeft: spacing.xsmall,
    paddingLeft: spacing.small,
    borderLeftWidth: 2,
  },
});
