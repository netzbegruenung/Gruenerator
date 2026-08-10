/**
 * Ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO — das Gegenstück
 * zu `apps/web/src/features/auth/components/AiConsentGate.tsx`.
 *
 * Beide lesen dasselbe Profilfeld (`ai_consent_at`) und schreiben über dieselbe
 * Route, die Einwilligung gilt also geräteübergreifend: wer im Web eingewilligt
 * hat, wird in der App nicht erneut gefragt. Das ist der Grund, warum der Status
 * am Profil hängt und nicht im lokalen Speicher — und warum es dieses Gate
 * überhaupt geben muss: ohne es wäre der Satz der Datenschutzerklärung, die
 * Einwilligung werde „vor der ersten Nutzung der KI-Funktionen gesondert"
 * eingeholt, für App-Nutzer*innen schlicht falsch.
 *
 * `Modal` mit `onRequestClose`-No-op statt eines Bottom Sheets: Ein Sheet lässt
 * sich wegwischen, und „weggewischt" wäre weder Zustimmung noch Ablehnung. Der
 * Ausgang liegt deshalb im Dialog selbst — ohne ihn wäre die Einwilligung nicht
 * freiwillig (Art. 7 Abs. 4 DSGVO).
 */

import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { logout } from '../../services/auth';
import { BODY_FONT, borderRadius, spacing } from '../../theme';
import { Button } from '../common/Button';

const DATENSCHUTZ_URL = 'https://gruenerator.eu/datenschutz';

export function AiConsentGate() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const setAiConsent = useAuthStore((s) => s.setAiConsent);

  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsConsent = user != null && user.ai_consent_at == null;
  if (!needsConsent) return null;

  const submit = () => {
    if (!checked || saving) return;
    setSaving(true);
    setError(null);
    // Den Zeitstempel schickt bewusst niemand mit — er ist der Nachweis
    // (Art. 7 Abs. 1 DSGVO) und darf nicht aus der Geräteuhr stammen.
    void setAiConsent(true)
      .catch(() => setError('Die Einwilligung konnte nicht gespeichert werden.'))
      .finally(() => setSaving(false));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={[styles.title, { color: theme.text }]}>
              Bevor es losgeht: Deine Einwilligung
            </Text>

            <Text style={[styles.body, { color: theme.text }]}>
              Der Grünerator ist eine KI-gestützte Plattform. Was Du eingibst oder sprichst, wird
              zur Bearbeitung an KI-Dienstleister mit Verarbeitung in der EU weitergeleitet.
            </Text>
            <Text style={[styles.body, { color: theme.text }]}>
              Weil hier politische Inhalte entstehen, können sich aus Deinen Eingaben politische
              Meinungen ergeben — das sind besondere Kategorien personenbezogener Daten (Art. 9
              DSGVO). Dafür brauchen wir Deine ausdrückliche Einwilligung.
            </Text>
            <Text style={[styles.body, { color: theme.text }]}>
              Ob und welche solcher Inhalte Du eingibst, entscheidest allein Du. Ein Training der
              KI-Modelle mit Deinen Daten findet nicht statt.{' '}
              <Text
                style={[styles.link, { color: theme.link }]}
                onPress={() => void Linking.openURL(DATENSCHUTZ_URL)}
              >
                Zur Datenschutzerklärung
              </Text>
            </Text>

            <Pressable
              onPress={() => setChecked((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              style={[styles.checkRow, { borderColor: theme.cardBorder }]}
            >
              <View
                style={[
                  styles.checkbox,
                  { borderColor: checked ? theme.textGreen : theme.textSecondary },
                  checked && { backgroundColor: theme.textGreen },
                ]}
              >
                {checked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
              </View>
              <Text style={[styles.checkLabel, { color: theme.text }]}>
                Ich willige ausdrücklich ein, dass meine Eingaben verarbeitet werden, auch soweit
                sie besondere Kategorien personenbezogener Daten wie politische Meinungen enthalten
                (Art. 9 Abs. 2 lit. a DSGVO).
              </Text>
            </Pressable>

            {error != null && <Text style={[styles.error, { color: theme.text }]}>{error}</Text>}

            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Du kannst diese Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen — in den
              Einstellungen unter Datenschutz.
            </Text>

            <Button onPress={submit} disabled={!checked} loading={saving}>
              Einwilligen und fortfahren
            </Button>
            <Button variant="ghost" onPress={() => void logout()} disabled={saving}>
              Ohne Einwilligung abmelden
            </Button>
          </ScrollView>
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
    maxHeight: '85%',
  },
  scroll: {
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
  link: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    textDecorationLine: 'underline',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.small,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.large,
    padding: spacing.small,
    marginTop: spacing.xsmall,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.small,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkLabel: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    fontFamily: BODY_FONT,
    fontSize: 14,
  },
  hint: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.xxsmall,
  },
});
