import {
  type BoardField,
  type BoardRow,
  type BoardState,
  type SelectOption,
} from '@gruenerator/contracts';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { darkTheme, lightTheme } from '../../theme';

import { BoardCardView } from './BoardCardView';
import { FIELD_IDS } from './boardCells';

interface Column {
  id: string;
  name: string;
  color?: string;
  rows: BoardRow[];
}

function optionsOf(field: BoardField | undefined): SelectOption[] {
  const opts = field?.typeOptions?.options;
  return Array.isArray(opts) ? (opts as SelectOption[]) : [];
}

/**
 * Read-only kanban render from the board snapshot. Columns come from the
 * group-by (status) field's options; cards are bucketed by their status cell,
 * with an "Ohne Status" bucket for unmatched cards. No drag, no collab.
 * Whiteboard boards and non-kanban views are out of scope (v1).
 */
export function BoardKanbanView({ state }: { state: BoardState }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const columns = useMemo<Column[]>(() => {
    const view = state.views.find((v) => v.layout === 'kanban') ?? state.views[0];
    const groupByFieldId = view?.groupByFieldId ?? FIELD_IDS.STATUS;
    const groupField = state.fields.find((f) => f.id === groupByFieldId);
    const options = optionsOf(groupField);
    const activeRows = state.rows.filter((r) => !r.archivedAt);

    const cols: Column[] = options.map((opt) => ({
      id: opt.id,
      name: opt.name,
      color: opt.color,
      rows: activeRows.filter((r) => r.cells[groupByFieldId] === opt.id),
    }));

    const known = new Set(options.map((o) => o.id));
    const orphans = activeRows.filter((r) => {
      const v = r.cells[groupByFieldId];
      return typeof v !== 'string' || v === '' || !known.has(v);
    });
    if (orphans.length > 0) {
      cols.push({ id: '__none__', name: 'Ohne Status', rows: orphans });
    }
    return cols;
  }, [state]);

  if (columns.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Dieses Board hat keine Spalten.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.columnsRow}
      showsHorizontalScrollIndicator={false}
    >
      {columns.map((col) => (
        <View key={col.id} style={styles.column}>
          <View style={styles.columnHeader}>
            {col.color ? <View style={[styles.dot, { backgroundColor: col.color }]} /> : null}
            <Text style={[styles.columnName, { color: theme.text }]} numberOfLines={1}>
              {col.name}
            </Text>
            <Text style={[styles.columnCount, { color: theme.textSecondary }]}>
              {col.rows.length}
            </Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.cards}>
            {col.rows.map((row) => (
              <BoardCardView key={row.id} row={row} fields={state.fields} theme={theme} />
            ))}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}

const COLUMN_WIDTH = 280;

const styles = StyleSheet.create({
  columnsRow: {
    padding: 12,
    gap: 12,
  },
  column: {
    width: COLUMN_WIDTH,
    flex: 1,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  columnName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  columnCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  cards: {
    paddingBottom: 24,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
  },
});
