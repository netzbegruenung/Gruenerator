/* eslint-disable react/no-array-index-key -- every element here is a fixed slot
   (column, card block, note, row); its position is its identity. */
import { type BoardPreview } from '@gruenerator/contracts';
import { useMemo, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { BODY_FONT, colors, darkTheme, lightTheme, spacing } from '../../theme';
import { parseSlidesPreview, parseTablePreview } from '../../utils/htmlExcerpt';

/**
 * Native counterparts of web's `components/common/SchematicPreviews`: card
 * previews for boards, sheets and presentations. Each draws the real data the
 * server keeps on the row — kanban columns / whiteboard notes, the leading
 * table rows, the slide titles — and a type-faithful schematic until there is
 * any. Decorative: the card's own title carries the label.
 */

type PreviewProps = { style?: StyleProp<ViewStyle> };

function usePalette() {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  return {
    theme,
    paper: isDark ? colors.grey[900] : colors.white,
    bar: isDark ? colors.grey[700] : colors.grey[200],
    block: isDark ? colors.grey[800] : colors.grey[100],
    accentBar: isDark ? colors.secondary[600] : colors.secondary[300],
    noteTints: isDark
      ? [colors.secondary[900], colors.primary[900], colors.grey[800]]
      : [colors.secondary[100], colors.primary[100], colors.grey[100]],
  };
}

function Plate({ style, children }: PreviewProps & { children: ReactNode }) {
  const { paper } = usePalette();
  return (
    <View
      style={[styles.plate, { backgroundColor: paper }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  );
}

const KANBAN_SCHEMATIC = [2, 1, 2];
const WHITEBOARD_SLOTS = 6;

export function BoardPreviewBody({
  boardType,
  preview,
  style,
}: PreviewProps & { boardType?: 'kanban' | 'whiteboard'; preview?: BoardPreview | null }) {
  const { theme, block, accentBar, noteTints } = usePalette();

  if (boardType === 'whiteboard') {
    const notes = preview?.notes ?? [];
    return (
      <Plate style={style}>
        <View style={styles.noteGrid}>
          {Array.from({ length: WHITEBOARD_SLOTS }, (_, idx) => (
            <View
              key={`note-${idx}`}
              style={[styles.note, { backgroundColor: noteTints[idx % noteTints.length] }]}
            >
              {notes[idx] ? (
                <Text style={[styles.noteText, { color: theme.text }]} numberOfLines={3}>
                  {notes[idx]}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </Plate>
    );
  }

  const columns = preview?.columns?.length ? preview.columns.slice(0, 3) : null;
  return (
    <Plate style={style}>
      <View style={styles.columns}>
        {columns
          ? columns.map((col, idx) => (
              <View key={`${col.name}-${idx}`} style={styles.column}>
                <Text style={[styles.columnName, { color: theme.textSecondary }]} numberOfLines={1}>
                  {col.name}
                </Text>
                {Array.from({ length: Math.min(col.count, 3) }, (_, i) => (
                  <View
                    key={`${col.name}-${idx}-${i}`}
                    style={[styles.card, { backgroundColor: block }]}
                  />
                ))}
              </View>
            ))
          : KANBAN_SCHEMATIC.map((cards, idx) => (
              <View key={`kanban-${idx}`} style={styles.column}>
                <View style={[styles.columnBar, { backgroundColor: accentBar }]} />
                {Array.from({ length: cards }, (_, i) => (
                  <View
                    key={`kanban-${idx}-${i}`}
                    style={[styles.card, { backgroundColor: block }]}
                  />
                ))}
              </View>
            ))}
      </View>
    </Plate>
  );
}

const TABLE_ROWS = 4;
const EMPTY_TABLE_ROWS = 3;

export function TablePreviewBody({ content, style }: PreviewProps & { content?: string }) {
  const { theme, bar, block } = usePalette();
  // The header row is dropped so the numbers read first — as on web.
  const dataRows = useMemo(
    () =>
      (content ? parseTablePreview(content) : [])
        .slice(1)
        .filter((row) => row.some((cell) => cell.length > 0))
        .slice(0, TABLE_ROWS),
    [content]
  );

  return (
    <Plate style={[styles.centered, style]}>
      {dataRows.length === 0
        ? Array.from({ length: EMPTY_TABLE_ROWS }, (_, idx) => (
            <View
              key={`tempty-${idx}`}
              style={[styles.tableRow, idx > 0 && { borderTopColor: block, borderTopWidth: 1 }]}
            >
              <View style={[styles.labelBar, { backgroundColor: bar }]} />
              <View style={[styles.valueBar, { backgroundColor: bar }]} />
            </View>
          ))
        : dataRows.map((row, idx) => (
            <View
              key={`trow-${idx}`}
              style={[styles.tableRow, idx > 0 && { borderTopColor: block, borderTopWidth: 1 }]}
            >
              <Text style={[styles.cellLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                {row[0] ?? ''}
              </Text>
              <Text style={[styles.cellValue, { color: theme.text }]} numberOfLines={1}>
                {row.length > 1 ? row[row.length - 1] : ''}
              </Text>
            </View>
          ))}
    </Plate>
  );
}

export function SlidesPreviewBody({ content, style }: PreviewProps & { content?: string }) {
  const { theme, accentBar } = usePalette();
  const { titles, total } = useMemo(
    () => (content ? parseSlidesPreview(content) : { titles: [] as string[], total: 0 }),
    [content]
  );
  const deckTitle = titles[0];

  return (
    <Plate style={[styles.centered, style]}>
      {deckTitle ? (
        <Text style={[styles.deckTitle, { color: theme.text }]} numberOfLines={3}>
          {deckTitle}
        </Text>
      ) : (
        <View style={[styles.titleBar, { backgroundColor: accentBar }]} />
      )}
      {total > 0 ? (
        <Text style={[styles.slideCount, { color: theme.textSecondary }]}>{total} Folien</Text>
      ) : null}
    </Plate>
  );
}

const styles = StyleSheet.create({
  plate: {
    flex: 1,
    padding: spacing.small,
    overflow: 'hidden',
  },
  centered: {
    justifyContent: 'center',
  },
  noteGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  note: {
    width: '31%',
    height: '47%',
    borderRadius: 4,
    padding: 3,
    overflow: 'hidden',
  },
  noteText: {
    fontFamily: BODY_FONT,
    fontSize: 8,
    lineHeight: 10,
  },
  columns: {
    flexDirection: 'row',
    gap: spacing.xsmall,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  columnName: {
    fontFamily: BODY_FONT,
    fontSize: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  columnBar: {
    height: 5,
    borderRadius: 3,
  },
  card: {
    height: 16,
    borderRadius: 4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xsmall,
    paddingVertical: 4,
  },
  cellLabel: {
    flexShrink: 1,
    fontFamily: BODY_FONT,
    fontSize: 10,
  },
  cellValue: {
    flexShrink: 0,
    maxWidth: '50%',
    fontFamily: BODY_FONT,
    fontSize: 10,
    fontWeight: '600',
  },
  labelBar: {
    height: 5,
    width: '55%',
    borderRadius: 3,
  },
  valueBar: {
    height: 5,
    width: '20%',
    borderRadius: 3,
  },
  deckTitle: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  titleBar: {
    height: 6,
    width: '50%',
    borderRadius: 3,
  },
  slideCount: {
    fontFamily: BODY_FONT,
    fontSize: 10,
    marginTop: 4,
  },
});
