import { type BoardField, type BoardRow, type SelectOption } from '@gruenerator/contracts';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { type Theme } from '../../theme';

import {
  FIELD_IDS,
  checklistProgress,
  parseAssignees,
  parseChecklists,
  type ChecklistGroup,
} from './boardCells';

function optionsOf(field: BoardField | undefined): SelectOption[] {
  const opts = field?.typeOptions?.options;
  return Array.isArray(opts) ? (opts as SelectOption[]) : [];
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/** One kanban card, read-only: title + due/labels/assignee/checklist badges. */
export function BoardCardView({
  row,
  fields,
  theme,
}: {
  row: BoardRow;
  fields: BoardField[];
  theme: Theme;
}) {
  const title = (row.cells[FIELD_IDS.TITLE] as string) || 'Ohne Titel';
  const due = row.cells[FIELD_IDS.DUE_DATE];
  const labelIds = row.cells[FIELD_IDS.LABELS];
  const assignees = parseAssignees(row.cells[FIELD_IDS.ASSIGNEE]);
  const checklist: ChecklistGroup[] = parseChecklists(row.cells[FIELD_IDS.CHECKLIST]);
  const progress = checklistProgress(checklist);

  const labelField = fields.find((f) => f.id === FIELD_IDS.LABELS);
  const labelOptions = optionsOf(labelField);
  const labels = Array.isArray(labelIds)
    ? labelIds
        .map((lid) => labelOptions.find((o) => o.id === lid))
        .filter((o): o is SelectOption => !!o)
    : [];

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      {row.coverImageUrl ? (
        <Image source={{ uri: row.coverImageUrl }} style={styles.cover} contentFit="cover" />
      ) : row.coverColor ? (
        <View style={[styles.coverColor, { backgroundColor: row.coverColor }]} />
      ) : null}

      {labels.length > 0 && (
        <View style={styles.labelRow}>
          {labels.map((l) => (
            <View key={l.id} style={[styles.labelChip, { backgroundColor: l.color }]}>
              <Text style={styles.labelText} numberOfLines={1}>
                {l.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.title, { color: theme.text }]} numberOfLines={3}>
        {title}
      </Text>

      <View style={styles.metaRow}>
        {typeof due === 'string' && due !== '' && (
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={13} color={theme.textSecondary} />
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>{formatDue(due)}</Text>
          </View>
        )}
        {progress.total > 0 && (
          <View style={styles.metaItem}>
            <Ionicons name="checkbox-outline" size={13} color={theme.textSecondary} />
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              {progress.done}/{progress.total}
            </Text>
          </View>
        )}
        {assignees.length > 0 && (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={13} color={theme.textSecondary} />
            <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
              {assignees.length === 1 ? assignees[0].name : `${assignees.length}`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
    gap: 6,
  },
  cover: {
    height: 80,
    borderRadius: 6,
    marginBottom: 2,
  },
  coverColor: {
    height: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  labelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  labelChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 140,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 12,
  },
});
