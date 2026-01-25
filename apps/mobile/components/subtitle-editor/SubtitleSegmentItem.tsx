/**
 * SubtitleSegmentItem Component
 * Individual segment in the timeline with inline editing
 */

import { useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, useColorScheme } from 'react-native';
import {
  colors,
  spacing,
  borderRadius,
  lightTheme,
  darkTheme,
  moderateScale,
  verticalScale,
  scale,
} from '../../theme';
import { formatTime } from '@gruenerator/shared/subtitle-editor';
import type { SubtitleSegment } from '@gruenerator/shared/subtitle-editor';

interface SubtitleSegmentItemProps {
  segment: SubtitleSegment;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  onTap: () => void;
  onTextChange: (text: string) => void;
  onEditComplete: () => void;
}

export function SubtitleSegmentItem({
  segment,
  isActive,
  isSelected,
  isEditing,
  onTap,
  onTextChange,
  onEditComplete,
}: SubtitleSegmentItemProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSubmit = useCallback(() => {
    onEditComplete();
  }, [onEditComplete]);

  const handleBlur = useCallback(() => {
    onEditComplete();
  }, [onEditComplete]);

  const getContainerStyle = () => {
    const baseStyle = [
      styles.container,
      { backgroundColor: theme.card, borderColor: theme.cardBorder },
    ];

    if (isEditing) {
      return [
        ...baseStyle,
        styles.editing,
        { borderColor: colors.primary[600], backgroundColor: theme.backgroundAlt },
      ];
    }

    if (isSelected) {
      return [
        ...baseStyle,
        styles.selected,
        { borderColor: colors.primary[400], backgroundColor: theme.backgroundAlt },
      ];
    }

    if (isActive) {
      return [...baseStyle, styles.active, { borderColor: colors.primary[200] }];
    }

    return baseStyle;
  };

  return (
    <Pressable onPress={onTap} style={getContainerStyle()}>
      <View style={styles.content}>
        {isEditing ? (
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
            value={segment.text}
            onChangeText={onTextChange}
            onBlur={handleBlur}
            onSubmitEditing={handleSubmit}
            multiline
            blurOnSubmit
            returnKeyType="done"
            autoFocus
            selectTextOnFocus
          />
        ) : (
          <Text style={[styles.text, { color: theme.text }]} numberOfLines={2} ellipsizeMode="tail">
            {segment.text}
          </Text>
        )}
        <View style={styles.timeContainer}>
          <Text style={[styles.time, { color: theme.textSecondary }]}>
            {formatTime(segment.startTime)}
          </Text>
          {isActive && <View style={styles.activeDot} />}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: verticalScale(48),
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(14),
    borderWidth: 1,
    borderRadius: moderateScale(8),
    marginHorizontal: scale(16),
    marginVertical: verticalScale(3),
  },
  active: {
    borderWidth: 2,
  },
  selected: {
    borderWidth: 2,
  },
  editing: {
    borderWidth: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
  },
  time: {
    fontSize: moderateScale(11),
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  activeDot: {
    width: moderateScale(6),
    height: moderateScale(6),
    borderRadius: moderateScale(3),
    backgroundColor: colors.primary[600],
  },
  text: {
    flex: 1,
    fontSize: moderateScale(14),
    lineHeight: moderateScale(19),
  },
  input: {
    flex: 1,
    fontSize: moderateScale(14),
    lineHeight: moderateScale(19),
    padding: scale(8),
    borderRadius: moderateScale(6),
    minHeight: verticalScale(52),
    textAlignVertical: 'top',
  },
});
