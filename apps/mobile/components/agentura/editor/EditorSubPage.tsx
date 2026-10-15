import { Stack, router } from 'expo-router';
import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../hooks/useTheme';
import { useAgentEditorStore } from '../../../stores/agentEditorStore';
import { colors, spacing, typography } from '../../../theme';
import { Button } from '../../common';

/**
 * Rahmen einer Editor-Unterseite: nativer Titel, scrollende Gruppen. Ohne
 * laufende Sitzung (App neu gestartet und direkt hierher verlinkt) gibt es
 * nichts zu bearbeiten — dann zurück zum Editor.
 */
export function EditorSubPage({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const active = useAgentEditorStore((s) => s.active);

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <Stack.Screen options={{ title }} />
      {active ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xlarge },
          ]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.centered}>
          <Text style={[styles.text, { color: theme.textSecondary }]}>
            Gerade wird kein Agent bearbeitet.
          </Text>
          <Button variant="outline" onPress={() => router.back()}>
            Zurück
          </Button>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** Schalter in einer Listenzeile, im App-Grün. */
export function RowSwitch({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: colors.primary[600], false: colors.grey[300] }}
      accessibilityLabel={label}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: spacing.medium,
    gap: spacing.large,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    padding: spacing.large,
  },
  text: {
    ...typography.body,
    textAlign: 'center',
  },
});
