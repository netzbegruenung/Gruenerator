import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { spacing, borderRadius, chatType } from '../../theme';

import type { Theme } from '../../theme/colors';
import type { MemoryContextInfo } from '@gruenerator/chat';

/**
 * Mirrors `memoryKindSchema` in @gruenerator/contracts (schemas/memory.ts),
 * same as web's copy.
 */
const CATEGORY_LABEL: Record<string, string> = {
  anweisung: 'Anweisung',
  fakt: 'Fakt',
};

/**
 * Says which remembered facts went into this answer, and lets the user unfold
 * them. Native counterpart of web's `MemoryIndicator`.
 *
 * The persona case has no list to show — the whole profile went in, and
 * enumerating it here would be a second, worse profile screen.
 */
export const MemoryIndicator = memo(function MemoryIndicator({
  memoryContext,
  theme,
}: {
  memoryContext: MemoryContextInfo;
  theme: Theme;
}) {
  const [expanded, setExpanded] = useState(false);
  const { memoryCount, memories, isPersona } = memoryContext;

  if (memoryCount === 0) return null;

  const label = isPersona
    ? 'Nutzerprofil berücksichtigt'
    : `${memoryCount} Erinnerung${memoryCount > 1 ? 'en' : ''} berücksichtigt`;
  const canExpand = !isPersona && memories.length > 0;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={canExpand ? () => setExpanded((e) => !e) : undefined}
        disabled={!canExpand}
        style={styles.trigger}
        accessibilityRole={canExpand ? 'button' : 'text'}
        accessibilityLabel={label}
      >
        <Ionicons name="sparkles-outline" size={13} color={theme.textSecondary} />
        <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
        {canExpand ? (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={theme.textSecondary}
          />
        ) : null}
      </Pressable>

      {expanded && canExpand ? (
        <View style={[styles.list, { borderLeftColor: theme.border }]}>
          {memories.map((memory, index) => (
            <View key={index} style={styles.memoryRow}>
              {memory.category ? (
                <View style={[styles.categoryChip, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.categoryText, { color: theme.textSecondary }]}>
                    {CATEGORY_LABEL[memory.category] ?? memory.category}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.memoryText, { color: theme.textSecondary }]}>
                {memory.content}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.medium,
    marginTop: spacing.xxsmall,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xxsmall,
  },
  label: {
    ...chatType.chatMeta,
  },
  list: {
    marginTop: spacing.xxsmall,
    marginLeft: spacing.xxsmall,
    paddingLeft: spacing.small,
    borderLeftWidth: 2,
    gap: spacing.xxsmall,
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxsmall,
  },
  categoryChip: {
    borderRadius: borderRadius.small,
    paddingHorizontal: spacing.xxsmall,
    paddingVertical: 1,
  },
  categoryText: {
    ...chatType.chatMicro,
    fontWeight: '600',
  },
  memoryText: {
    ...chatType.chatMeta,
    flex: 1,
  },
});
