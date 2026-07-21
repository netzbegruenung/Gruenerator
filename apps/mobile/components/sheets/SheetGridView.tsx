import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { darkTheme, lightTheme } from '../../theme';

import {
  alignFor,
  cellAt,
  cellText,
  columnWidth,
  coveredCells,
  orderedSheets,
  resolveStyle,
  rowHeight,
  usedRange,
  type WorkbookSnapshot,
} from './sheetSnapshot';

const GUTTER_WIDTH = 46;

function colLabel(n: number): string {
  let s = '';
  let x = n;
  do {
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26) - 1;
  } while (x >= 0);
  return s;
}

/**
 * Read-only spreadsheet grid rendered natively from the Univer snapshot (no
 * WebView, no Univer runtime). Rows are virtualized (FlatList) inside a
 * horizontal scroll so wide sheets scroll both axes. Cell value + basic style
 * (background, bold, font colour, alignment), column widths, row heights and
 * merges (anchor cell only) are honoured. Charts and number-format patterns are
 * out of scope (v1) — cells show their cached value.
 */
export function SheetGridView({ workbook }: { workbook: WorkbookSnapshot | null }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';
  const grid = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
  const headerBg = theme.surface;

  const sheets = useMemo(() => orderedSheets(workbook), [workbook]);
  const [active, setActive] = useState(0);
  const current = sheets[active];

  const model = useMemo(() => {
    if (!current) return null;
    const range = usedRange(current.sheet);
    const widths = Array.from({ length: range.cols }, (_, c) => columnWidth(current.sheet, c));
    const covered = coveredCells(current.sheet);
    return { range, widths, covered };
  }, [current]);

  if (!workbook || !current || !model || model.range.rows === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Diese Tabelle ist leer.
        </Text>
      </View>
    );
  }

  const { range, widths, covered } = model;

  const renderRow = ({ item: r }: { item: number }) => {
    const h = rowHeight(current.sheet, r);
    return (
      <View style={{ flexDirection: 'row', height: h }}>
        <View
          style={[
            styles.gutterCell,
            { width: GUTTER_WIDTH, height: h, backgroundColor: headerBg, borderColor: grid },
          ]}
        >
          <Text style={[styles.gutterText, { color: theme.textSecondary }]}>{r + 1}</Text>
        </View>
        {widths.map((w, c) => {
          if (covered.has(`${r}:${c}`)) {
            return (
              <View
                key={c}
                style={{
                  width: w,
                  height: h,
                  borderRightWidth: StyleSheet.hairlineWidth,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: grid,
                }}
              />
            );
          }
          const cell = cellAt(current.sheet, r, c);
          const style = workbook ? resolveStyle(workbook, cell) : undefined;
          return (
            <View
              key={c}
              style={{
                width: w,
                height: h,
                justifyContent: 'center',
                paddingHorizontal: 5,
                borderRightWidth: StyleSheet.hairlineWidth,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderColor: grid,
                backgroundColor: style?.bg?.rgb ?? 'transparent',
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 13,
                  textAlign: alignFor(style?.ht),
                  fontWeight: style?.bl ? '700' : '400',
                  color: style?.cl?.rgb ?? theme.text,
                }}
              >
                {cellText(cell)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator bounces={false}>
        <View>
          {/* Column-letter header */}
          <View style={{ flexDirection: 'row' }}>
            <View
              style={[
                styles.gutterCell,
                { width: GUTTER_WIDTH, height: 26, backgroundColor: headerBg, borderColor: grid },
              ]}
            />
            {widths.map((w, c) => (
              <View
                key={c}
                style={[
                  styles.headerCell,
                  { width: w, height: 26, backgroundColor: headerBg, borderColor: grid },
                ]}
              >
                <Text style={[styles.headerText, { color: theme.textSecondary }]}>
                  {colLabel(c)}
                </Text>
              </View>
            ))}
          </View>
          <FlatList
            data={Array.from({ length: range.rows }, (_, i) => i)}
            keyExtractor={(i) => String(i)}
            renderItem={renderRow}
            initialNumToRender={30}
            windowSize={11}
            removeClippedSubviews
            showsVerticalScrollIndicator
          />
        </View>
      </ScrollView>

      {sheets.length > 1 && (
        <ScrollView
          horizontal
          style={[styles.tabBar, { backgroundColor: theme.card, borderColor: theme.border }]}
          contentContainerStyle={styles.tabBarContent}
          showsHorizontalScrollIndicator={false}
        >
          {sheets.map((s, i) => (
            <Pressable
              key={s.id}
              onPress={() => setActive(i)}
              style={[styles.tab, i === active && { backgroundColor: theme.surface }]}
            >
              <Text
                style={[styles.tabText, { color: i === active ? theme.text : theme.textSecondary }]}
                numberOfLines={1}
              >
                {s.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: { fontSize: 14 },
  gutterCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gutterText: { fontSize: 11, fontWeight: '600' },
  headerCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { fontSize: 11, fontWeight: '700' },
  tabBar: {
    maxHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabBarContent: {
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 6,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  tabText: { fontSize: 13, fontWeight: '600', maxWidth: 160 },
});
