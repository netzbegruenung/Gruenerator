import { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme, darkTheme, typography, spacing, colors, borderRadius } from '../../theme';

interface InstructionCardProps {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => Promise<void>;
  maxLength?: number;
  isSaving?: boolean;
  lastSaved?: number | null;
}

const DEBOUNCE_DELAY = 2000;

export function InstructionCard({
  title,
  value,
  onChange,
  onSave,
  maxLength = 2000,
  isSaving = false,
  lastSaved,
}: InstructionCardProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [isExpanded, setIsExpanded] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const hasChanges = localValue !== value;

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback(
    (text: string) => {
      if (text.length <= maxLength) {
        setLocalValue(text);
        onChange(text);

        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
          onSave();
        }, DEBOUNCE_DELAY);
      }
    },
    [onChange, onSave, maxLength]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const hasContent = localValue.length > 0;
  const characterCount = localValue.length;

  return (
    <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Pressable style={styles.header} onPress={toggleExpanded}>
        <View style={styles.headerContent}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: hasContent ? colors.primary[500] : theme.textSecondary },
            ]}
          />
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        </View>

        <View style={styles.headerRight}>
          {isSaving && (
            <ActivityIndicator
              size="small"
              color={colors.primary[600]}
              style={styles.savingIndicator}
            />
          )}
          {!isSaving && lastSaved && hasContent && (
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={colors.primary[500]}
              style={styles.savedIcon}
            />
          )}
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.textSecondary}
          />
        </View>
      </Pressable>

      {isExpanded && (
        <View style={styles.content}>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: theme.background,
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
            value={localValue}
            onChangeText={handleChange}
            placeholder="Eigene Anweisungen für diesen Generator eingeben..."
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <View style={styles.footer}>
            <Text style={[styles.characterCount, { color: theme.textSecondary }]}>
              {characterCount} / {maxLength} Zeichen
            </Text>
            {hasContent && (
              <Pressable style={styles.clearButton} onPress={() => handleChange('')}>
                <Text style={[styles.clearButtonText, { color: colors.error[500] }]}>Löschen</Text>
              </Pressable>
            )}
          </View>

          <Text style={[styles.helpText, { color: theme.textSecondary }]}>
            Diese Anweisungen werden bei jeder Generierung mit diesem Typ berücksichtigt.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.medium,
    marginVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.medium,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.small,
  },
  title: {
    ...typography.bodyBold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savingIndicator: {
    marginRight: spacing.small,
  },
  savedIcon: {
    marginRight: spacing.small,
  },
  content: {
    padding: spacing.medium,
    paddingTop: 0,
  },
  textInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: borderRadius.small,
    padding: spacing.medium,
    minHeight: 120,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.small,
  },
  characterCount: {
    ...typography.caption,
  },
  clearButton: {
    padding: spacing.xsmall,
  },
  clearButtonText: {
    ...typography.caption,
    fontWeight: '500',
  },
  helpText: {
    ...typography.caption,
    marginTop: spacing.small,
    fontStyle: 'italic',
  },
});
