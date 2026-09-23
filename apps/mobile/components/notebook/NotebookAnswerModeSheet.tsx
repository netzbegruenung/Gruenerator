import { NOTEBOOK_ANSWER_MODES, notebookAnswerModeDef } from '@gruenerator/chat';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { spacing } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { ListGroup, ListRow } from '../common/ListRow';

import type { Theme } from '../../theme/colors';
import type { ComposerAccessory } from '../common/Composer';
import type { NotebookAnswerMode } from '@gruenerator/contracts';

export const ANSWER_MODE_ICONS: Record<NotebookAnswerMode, IoniconsIconName> = {
  auto: 'sparkles-outline',
  chat: 'chatbubble-outline',
  praezision: 'list-outline',
};

/**
 * The composer chip for the notebook answer mode — labelled, so it sits next to
 * Send like web's picker. Reads the persisted preference; `onPress` opens
 * `NotebookAnswerModeSheet`.
 */
export function useAnswerModeAccessory(onPress: () => void): ComposerAccessory {
  const mode = usePreferencesStore((s) => s.notebookAnswerMode);
  return useMemo(() => {
    const def = notebookAnswerModeDef(mode);
    return {
      icon: ANSWER_MODE_ICONS[def.mode],
      label: def.label,
      onPress,
      accessibilityLabel: `Antwortmodus: ${def.label}`,
    };
  }, [mode, onPress]);
}

/** Option sheet for the notebook answer mode (Automatisch / Chat / Präzision). */
export const NotebookAnswerModeSheet = memo(function NotebookAnswerModeSheet({
  visible,
  onClose,
  theme: themeProp,
}: {
  visible: boolean;
  onClose: () => void;
  theme?: Theme;
}) {
  const resolvedTheme = useTheme();
  const theme = themeProp ?? resolvedTheme;
  const isDark = useColorScheme() === 'dark';
  const mode = usePreferencesStore((s) => s.notebookAnswerMode);
  const setMode = usePreferencesStore((s) => s.setNotebookAnswerMode);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={isDark ? theme.background : theme.surface}
    >
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Ionicons name="close" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          Antwortmodus
        </Text>
        <View style={styles.headerButton} />
      </View>
      <View style={styles.content}>
        <ListGroup>
          {NOTEBOOK_ANSWER_MODES.map((def, i) => (
            <ListRow
              key={def.mode}
              icon={ANSWER_MODE_ICONS[def.mode]}
              title={def.label}
              {...(def.recommended && { titleBadge: 'Empfohlen' })}
              value={def.description}
              valueLines={2}
              onPress={() => {
                void setMode(def.mode);
                onClose();
              }}
              selected={mode === def.mode}
              last={i === NOTEBOOK_ANSWER_MODES.length - 1}
            />
          ))}
        </ListGroup>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.medium,
  },
  headerButton: {
    width: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Raleway_700Bold',
    fontSize: 22,
  },
  content: {
    paddingHorizontal: spacing.medium,
  },
});
