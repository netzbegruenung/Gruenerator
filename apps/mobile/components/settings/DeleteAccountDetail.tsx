import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { DeleteAccountError, deleteAccount } from '../../services/auth';
import { useSettingsSheetStore } from '../../stores/settingsSheetStore';
import { spacing, colors, borderRadius, BODY_FONT, HEADING_FONT_BOLD } from '../../theme';

const CONFIRM_WORD = 'löschen';

export function DeleteAccountDetail() {
  const theme = useTheme();
  const close = useSettingsSheetStore((s) => s.close);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = input.trim().toLowerCase() === CONFIRM_WORD;

  const run = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      // Logged out now; reset the sheet so it does not reopen on this pane after the next login.
      close();
    } catch (err) {
      setError(
        err instanceof DeleteAccountError && err.message
          ? err.message
          : 'Das Konto konnte nicht gelöscht werden. Bitte versuche es erneut.'
      );
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={[styles.text, { color: theme.textSecondary }]}>
        Wenn du dein Konto löschst, werden dein Konto, deine Inhalte, deine Notebooks und deine
        Einstellungen endgültig entfernt. Das lässt sich nicht rückgängig machen.
      </Text>
      <Text style={[styles.text, { color: theme.textSecondary }]}>
        Tippe zur Bestätigung „{CONFIRM_WORD}“ ein.
      </Text>
      <TextInput
        value={input}
        onChangeText={setInput}
        editable={!busy}
        placeholder={CONFIRM_WORD}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Bestätigung eingeben"
        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
      />
      {error ? (
        <Text style={[styles.text, { color: colors.error[600] }]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={() => void run()}
        disabled={!confirmed || busy}
        accessibilityRole="button"
        accessibilityLabel="Konto endgültig löschen"
        accessibilityState={{ disabled: !confirmed || busy, busy }}
        style={[styles.button, { opacity: confirmed || busy ? 1 : 0.4 }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>Konto endgültig löschen</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.medium },
  text: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20 },
  input: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  button: {
    backgroundColor: colors.error[600],
    borderRadius: borderRadius.medium,
    paddingVertical: spacing.medium,
    alignItems: 'center',
  },
  buttonText: { fontFamily: HEADING_FONT_BOLD, fontSize: 16, color: colors.white },
});
