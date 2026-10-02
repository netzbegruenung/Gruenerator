import {
  NOTEBOOK_ANSWER_MODES,
  NOTEBOOK_COMPOSER_MODES,
  notebookComposerModeDef,
  type NotebookComposerMode,
  type NotebookComposerModeDef,
} from '@gruenerator/chat';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { spacing, HEADING_FONT_BOLD } from '../../theme';
import { type Theme } from '../../theme/colors';
import { BottomSheet } from '../common/BottomSheet';
import { type ComposerAccessory } from '../common/Composer';
import { ListGroup, ListRow } from '../common/ListRow';

export const ANSWER_MODE_ICONS: Record<NotebookComposerMode, IoniconsIconName> = {
  auto: 'sparkles-outline',
  chat: 'chatbubble-outline',
  praezision: 'list-outline',
  manuell: 'search-outline',
};

/**
 * The mode a surface actually runs. `manuell` exists only on a notebook start
 * page (`withManual`); inside a conversation a stored one counts as the
 * default — like web's picker, it shows what will actually be sent.
 */
function useActiveModeDef(withManual: boolean): NotebookComposerModeDef {
  const mode = usePreferencesStore((s) => s.notebookAnswerMode);
  return notebookComposerModeDef(mode === 'manuell' && !withManual ? null : mode);
}

/**
 * The composer chip for the notebook answer mode — labelled, so it sits next to
 * Send like web's picker, with the short label so the input keeps its room.
 * Reads the persisted preference; `onPress` opens `NotebookAnswerModeSheet`.
 */
export function useAnswerModeAccessory(
  onPress: () => void,
  { withManual = false }: { withManual?: boolean } = {}
): ComposerAccessory {
  const def = useActiveModeDef(withManual);
  return useMemo(
    () => ({
      icon: ANSWER_MODE_ICONS[def.mode],
      label: def.shortLabel ?? def.label,
      onPress,
      accessibilityLabel: `Antwortmodus: ${def.label}`,
    }),
    [def, onPress]
  );
}

/** Option sheet for the notebook answer mode (Magic Search / Chat / Präzision,
 *  plus Manuell on a start page). */
export const NotebookAnswerModeSheet = memo(function NotebookAnswerModeSheet({
  visible,
  onClose,
  theme: themeProp,
  withManual = false,
}: {
  visible: boolean;
  onClose: () => void;
  theme?: Theme;
  withManual?: boolean;
}) {
  const resolvedTheme = useTheme();
  const theme = themeProp ?? resolvedTheme;
  const isDark = useColorScheme() === 'dark';
  const active = useActiveModeDef(withManual);
  const setMode = usePreferencesStore((s) => s.setNotebookAnswerMode);
  const modes = withManual ? NOTEBOOK_COMPOSER_MODES : NOTEBOOK_ANSWER_MODES;

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
          {modes.map((def, i) => (
            <ListRow
              key={def.mode}
              dense
              title={def.label}
              {...(def.recommended && { titleBadge: 'Empfohlen' })}
              value={def.description}
              valueLines={2}
              onPress={() => {
                void setMode(def.mode);
                onClose();
              }}
              selected={active.mode === def.mode}
              last={i === modes.length - 1}
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
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 17,
  },
  content: {
    paddingHorizontal: spacing.medium,
  },
});
