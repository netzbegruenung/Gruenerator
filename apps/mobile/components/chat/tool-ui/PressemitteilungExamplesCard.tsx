import {
  getToolQuery,
  parsePressemitteilungExamples,
  pressemitteilungLvLabel,
  formatGermanDate,
} from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';

import { colors, spacing, borderRadius } from '../../../theme';

import type { Theme } from '../../../theme/colors';

interface ToolCallPart {
  args: Record<string, unknown>;
  result?: unknown;
}

// Native counterpart of web's PressemitteilungExamplesCard
// (gruenerator_pressemitteilung_examples): an expandable card listing press
// releases by Landesverband; each row expands to the full body + source link.
export function PressemitteilungExamplesCard({
  part,
  theme,
}: {
  part: ToolCallPart;
  theme: Theme;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const query = getToolQuery(part.args);
  const { examples, message } = useMemo(
    () => parsePressemitteilungExamples(part.result),
    [part.result]
  );

  const lvSummary = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const ex of examples) {
      const label = pressemitteilungLvLabel(ex.lv);
      if (seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
    return labels.join(' · ');
  }, [examples]);

  if (examples.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.headerRow}>
          <Ionicons name="newspaper-outline" size={16} color={colors.secondary[700]} />
          <Text style={[styles.title, { color: theme.text }]}>Pressemitteilungen</Text>
        </View>
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          {message ?? 'Keine passenden Pressemitteilungen gefunden.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Pressable style={styles.headerRow} onPress={() => setExpanded((v) => !v)}>
        <Ionicons name="newspaper-outline" size={16} color={colors.secondary[700]} />
        <View style={styles.headerBody}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {examples.length} Pressemitteilung{examples.length === 1 ? '' : 'en'}
            {query ? ` zu „${query}"` : ''}
          </Text>
          {lvSummary.length > 0 && (
            <Text style={[styles.lvSummary, { color: theme.textSecondary }]} numberOfLines={1}>
              {lvSummary}
            </Text>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.textSecondary}
        />
      </Pressable>

      {expanded && (
        <View style={[styles.list, { borderTopColor: theme.border }]}>
          {examples.map((ex) => {
            const isOpen = openRow === ex.id;
            const date = formatGermanDate(ex.publishedAt);
            return (
              <View key={ex.id} style={[styles.item, { borderTopColor: theme.border }]}>
                <Pressable
                  style={styles.itemHeader}
                  onPress={() => setOpenRow(isOpen ? null : ex.id)}
                >
                  <Ionicons
                    name={isOpen ? 'chevron-down' : 'chevron-forward'}
                    size={13}
                    color={theme.textSecondary}
                    style={styles.itemChevron}
                  />
                  <View style={styles.itemBody}>
                    <View style={styles.itemMetaRow}>
                      <Text style={[styles.lvBadge, { color: colors.primary[700] }]}>
                        {pressemitteilungLvLabel(ex.lv)}
                      </Text>
                      {date && (
                        <Text style={[styles.date, { color: theme.textSecondary }]}>{date}</Text>
                      )}
                    </View>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>{ex.title}</Text>
                  </View>
                </Pressable>

                {isOpen && (
                  <View style={styles.itemExpanded}>
                    <Text style={[styles.itemText, { color: theme.text }]}>{ex.body}</Text>
                    {ex.url && (
                      <Pressable
                        style={styles.sourceLink}
                        onPress={() => ex.url && void Linking.openURL(ex.url)}
                      >
                        <Text style={[styles.sourceLinkText, { color: colors.primary[600] }]}>
                          Quelle öffnen
                        </Text>
                        <Ionicons name="open-outline" size={12} color={colors.primary[600]} />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xsmall,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    padding: spacing.small,
  },
  headerBody: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  lvSummary: {
    fontSize: 12,
  },
  empty: {
    fontSize: 12,
    paddingHorizontal: spacing.small,
    paddingBottom: spacing.small,
  },
  list: {
    borderTopWidth: 1,
  },
  item: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxsmall,
  },
  itemChevron: {
    marginTop: 3,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  lvBadge: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  date: {
    fontSize: 11,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  itemExpanded: {
    marginTop: spacing.xsmall,
    paddingLeft: spacing.medium,
    gap: spacing.xsmall,
  },
  itemText: {
    fontSize: 13,
    lineHeight: 19,
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
  },
  sourceLinkText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
