/**
 * SubtitleSegmentItem Component
 * Individual segment in the timeline with inline editing
 */

import { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  useColorScheme,
} from 'react-native';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
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
      return [
        ...baseStyle,
        styles.active,
        { borderColor: colors.primary[200] },
      ];
    }

    return baseStyle;
  };

  return (
    <Pressable onPress={onTap} style={getContainerStyle()}>
      <View style={styles.header}>
        <Text style={[styles.time, { color: theme.textSecondary }]}>
          {formatTime(segment.startTime)}
        </Text>
        {isActive && (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>Aktiv</Text>
          </View>
        )}
      </View>

      {isEditing ? (
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.background },
          ]}
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
        <Text
          style={[styles.text, { color: theme.text }]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {segment.text}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    marginHorizontal: spacing.medium,
    marginVertical: spacing.xsmall,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxsmall,
  },
  time: {
    fontSize: 12,
    fontWeight: '500',
  },
  activeBadge: {
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.small,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
  },
  input: {
    fontSize: 15,
    lineHeight: 20,
    padding: spacing.xsmall,
    borderRadius: borderRadius.small,
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
