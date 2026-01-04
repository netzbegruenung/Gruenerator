/**
 * SubtitleTimeline Component
 * Scrollable list of subtitle segments
 */

import { forwardRef, useCallback } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { colors, spacing, lightTheme, darkTheme, verticalScale } from '../../theme';
import { SubtitleSegmentItem } from './SubtitleSegmentItem';
import { SUBTITLE_EDITOR_LABELS } from '@gruenerator/shared/subtitle-editor';
import type { SubtitleSegment } from '@gruenerator/shared/subtitle-editor';

interface SubtitleTimelineProps {
  segments: SubtitleSegment[];
  activeSegmentId: number | null;
  selectedSegmentId: number | null;
  editingSegmentId: number | null;
  onSegmentTap: (segmentId: number) => void;
  onTextChange: (segmentId: number, text: string) => void;
  onEditComplete: () => void;
}

export const SubtitleTimeline = forwardRef<FlatList<SubtitleSegment>, SubtitleTimelineProps>(
  function SubtitleTimeline(
    {
      segments,
      activeSegmentId,
      selectedSegmentId,
      editingSegmentId,
      onSegmentTap,
      onTextChange,
      onEditComplete,
    },
    ref
  ) {
    const colorScheme = useColorScheme();
    const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

    const renderItem = useCallback(
      ({ item }: { item: SubtitleSegment }) => (
        <SubtitleSegmentItem
          segment={item}
          isActive={item.id === activeSegmentId}
          isSelected={item.id === selectedSegmentId}
          isEditing={item.id === editingSegmentId}
          onTap={() => onSegmentTap(item.id)}
          onTextChange={(text) => onTextChange(item.id, text)}
          onEditComplete={onEditComplete}
        />
      ),
      [activeSegmentId, selectedSegmentId, editingSegmentId, onSegmentTap, onTextChange, onEditComplete]
    );

    const keyExtractor = useCallback(
      (item: SubtitleSegment) => item.id.toString(),
      []
    );

    // Item height: minHeight (48) + vertical margins (3*2) = 54, scaled
    const itemHeight = verticalScale(48) + verticalScale(3) * 2;

    const getItemLayout = useCallback(
      (_data: ArrayLike<SubtitleSegment> | null | undefined, index: number) => ({
        length: itemHeight,
        offset: itemHeight * index,
        index,
      }),
      [itemHeight]
    );

    if (segments.length === 0) {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {SUBTITLE_EDITOR_LABELS.noSubtitles}
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        ref={ref}
        data={segments}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        style={[styles.list, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollToIndexFailed={(info) => {
          const wait = new Promise((resolve) => setTimeout(resolve, 100));
          wait.then(() => {
            if (ref && 'current' in ref && ref.current && segments.length > 0) {
              ref.current.scrollToIndex({
                index: Math.min(info.index, segments.length - 1),
                animated: true,
              });
            }
          });
        }}
      />
    );
  }
);

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: spacing.small,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xlarge,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
});
