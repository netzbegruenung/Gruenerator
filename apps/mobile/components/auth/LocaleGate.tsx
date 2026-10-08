/**
 * Einmalige Länderfrage, wenn das Profil kein Land trägt — das Gegenstück zu
 * `apps/web/src/features/auth/components/LocaleGate.tsx`; die Begründung, warum
 * es ein Gate ist und keine Zeile in den Einstellungen, steht dort.
 *
 * Wer ohne Land ankommt: `config/localeSync.ts` schreibt nur für IdPs, die ein
 * Land bezeichnen, und fällt sonst nicht mehr auf Deutschland zurück (#2921).
 * Ohne dieses Gate zeigte die App solchen Konten still die deutsche Ausprägung.
 *
 * Gelesen wird der rohe `user.locale` (Sitzung und Profil tragen ihn, wie
 * `ai_consent_at`), nicht `state.locale` — das koerziert der Store auf
 * 'de-DE' und wäre nie leer.
 *
 * `Modal` mit `onRequestClose`-No-op wie beim AiConsentGate: Wegwischen wäre
 * keine Antwort. Keine Vorauswahl, kein „Später" — die Wahl ist jederzeit in
 * den Einstellungen änderbar, aber vorwegnehmen dürfen wir sie nicht.
 */

import { useAuthStore } from '@gruenerator/shared/stores';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, borderRadius, spacing } from '../../theme';

import type { SupportedLocale } from '@gruenerator/contracts';

const CHOICES: readonly { locale: SupportedLocale; label: string; hint: string }[] = [
  { locale: 'de-DE', label: 'Deutschland', hint: 'Bündnis 90/Die Grünen' },
  { locale: 'de-AT', label: 'Österreich', hint: 'Die Grünen – Die Grüne Alternative' },
];

export function LocaleGate() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const updateLocale = useAuthStore((s) => s.updateLocale);

  const [saving, setSaving] = useState<SupportedLocale | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Die Einwilligung hat Vorrang: zwei Modals übereinander wären beide nicht
  // bedienbar.
  const needsLocale = user != null && user.ai_consent_at != null && user.locale == null;
  if (!needsLocale) return null;

  const choose = (locale: SupportedLocale) => {
    if (saving) return;
    setSaving(locale);
    setError(null);
    void updateLocale(locale)
      .catch(() => setError('Das Land konnte nicht gespeichert werden.'))
      .finally(() => setSaving(null));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            In welchem Land bist Du grün aktiv?
          </Text>
          <Text style={[styles.body, { color: theme.text }]}>
            Dein Zugang verrät es uns nicht, und wir möchten nicht das Falsche raten — deshalb
            fragen wir einmal nach.
          </Text>
          <Text style={[styles.body, { color: theme.text }]}>
            Danach richten sich Wortwahl, Parteiname und die Quellen, in denen der Grünerator
            recherchiert. Ändern kannst Du es jederzeit in den Einstellungen.
          </Text>

          {CHOICES.map((choice) => (
            <Pressable
              key={choice.locale}
              onPress={() => choose(choice.locale)}
              disabled={saving !== null}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving !== null, busy: saving === choice.locale }}
              style={({ pressed }) => [
                styles.choice,
                { borderColor: theme.cardBorder },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.choiceLabel, { color: theme.text }]}>
                {saving === choice.locale ? 'Wird gespeichert …' : choice.label}
              </Text>
              <Text style={[styles.choiceHint, { color: theme.textSecondary }]}>{choice.hint}</Text>
            </Pressable>
          ))}

          {error != null && <Text style={[styles.body, { color: theme.text }]}>{error}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.medium,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  card: {
    borderRadius: borderRadius.xlarge,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.large,
    gap: spacing.small,
  },
  title: {
    fontFamily: BODY_FONT,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xxsmall,
  },
  body: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    lineHeight: 22,
  },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.large,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    gap: 2,
  },
  choiceLabel: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '600',
  },
  choiceHint: {
    fontFamily: BODY_FONT,
    fontSize: 13,
  },
});
