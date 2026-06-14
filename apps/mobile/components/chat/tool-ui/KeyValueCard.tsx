import { getToolMeta, getToolQuery } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius } from '../../../theme';

import { ToolCitationList } from './ToolCitationList';
import { toolIonicon } from './toolIcons';

import type { Theme } from '../../../theme/colors';
import type { KeyValueVM } from '@gruenerator/chat';

interface ToolCallPart {
  toolName: string;
  args: Record<string, unknown>;
}

// Native renderer for the 'key-value' view kind: the generic fallback for
// unregistered/future tools. Mirrors web's KeyValueResult — a labeled pill
// expanding to scalar entries, lifted citations, markdown text, and an image.
export function KeyValueCard({
  part,
  vm,
  theme,
}: {
  part: ToolCallPart;
  vm: KeyValueVM;
  theme: Theme;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = getToolMeta(part.toolName);
  const query = getToolQuery(part.args);
  const hasContent =
    vm.entries.length > 0 ||
    vm.citations.length > 0 ||
    vm.markdown !== null ||
    vm.imageUrl !== null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => hasContent && setExpanded((x) => !x)}
        style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Ionicons name={toolIonicon(meta.iconKey)} size={14} color={colors.primary[500]} />
        <Text style={[styles.label, { color: theme.text }]}>{meta.label}</Text>
        {query && (
          <Text style={[styles.query, { color: theme.textSecondary }]} numberOfLines={1}>
            „{query}"
          </Text>
        )}
        {hasContent && (
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={theme.textSecondary}
          />
        )}
      </Pressable>

      {expanded && hasContent && (
        <View style={[styles.details, { borderLeftColor: theme.border }]}>
          {vm.imageUrl && (
            <Image
              source={{ uri: vm.imageUrl }}
              style={[styles.image, { backgroundColor: theme.surface }]}
              contentFit="cover"
              accessibilityLabel={meta.label}
            />
          )}
          {vm.markdown && (
            <Text style={[styles.markdown, { color: theme.text }]}>{vm.markdown}</Text>
          )}
          {vm.entries.map((entry) => (
            <View key={entry.label} style={styles.row}>
              <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{entry.label}</Text>
              <Text style={[styles.rowValue, { color: theme.text }]}>{entry.value}</Text>
            </View>
          ))}
          {vm.citations.length > 0 && <ToolCitationList citations={vm.citations} theme={theme} />}
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
  details: {
    marginTop: spacing.xsmall,
    marginLeft: spacing.xsmall,
    paddingLeft: spacing.small,
    borderLeftWidth: 2,
    gap: spacing.xxsmall,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: borderRadius.medium,
  },
  markdown: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xsmall,
  },
  rowLabel: {
    fontSize: 12,
    minWidth: 90,
  },
  rowValue: {
    flex: 1,
    fontSize: 12,
  },
});
