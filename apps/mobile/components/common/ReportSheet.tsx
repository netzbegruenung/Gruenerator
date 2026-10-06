import { type ContentReportCreate, type ContentReportReason } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, borderRadius, colors, spacing } from '../../theme';

import { BottomSheet } from './BottomSheet';

/** Display order of the reasons; the record keeps the labels exhaustive over the contract enum. */
const REASON_LABELS: Record<ContentReportReason, string> = {
  offensive: 'Beleidigend oder hasserfüllt',
  false_information: 'Falschinformation',
  harassment: 'Belästigung',
  illegal: 'Rechtswidrig',
  other: 'Sonstiges',
};
const REASONS = Object.keys(REASON_LABELS) as ContentReportReason[];

const RATE_LIMIT_ERROR = 'Zu viele Meldungen, bitte versuch es später erneut.';
const FALLBACK_ERROR = 'Die Meldung konnte nicht gesendet werden. Bitte versuche es erneut.';

export type ReportTarget = Pick<
  ContentReportCreate,
  'kind' | 'targetId' | 'groupId' | 'threadId' | 'excerpt'
>;

interface ReportSheetProps {
  /** null = geschlossen. */
  target: ReportTarget | null;
  onClose: () => void;
}

export function ReportSheet({ target, onClose }: ReportSheetProps) {
  return (
    <BottomSheet visible={!!target} onClose={onClose} padded keyboardAvoiding>
      {target ? <ReportForm target={target} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

/** Mounted only while the sheet is open, so every report starts with a clean form. */
function ReportForm({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const theme = useTheme();
  const [reason, setReason] = useState<ContentReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = note.trim();
      const result = await getContractsClient().contentReports.create({
        body: {
          ...target,
          reason,
          ...(trimmed ? { note: trimmed } : {}),
        },
      });
      if (result.status === 200) {
        setDone(true);
      } else {
        // Server messages are English internals; never show them verbatim.
        setError(result.status === 429 ? RATE_LIMIT_ERROR : FALLBACK_ERROR);
      }
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
        Inhalt melden
      </Text>
      {done ? (
        <>
          <Text style={[styles.text, { color: theme.text }]} accessibilityRole="alert">
            Danke, wir sehen uns das an.
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Schließen"
            style={styles.button}
          >
            <Text style={styles.buttonText}>Schließen</Text>
          </Pressable>
        </>
      ) : (
        <>
          {target.kind === 'chat_message' ? (
            <Text style={[styles.text, { color: theme.textSecondary }]}>
              Der Text der Antwort wird mit der Meldung übermittelt.
            </Text>
          ) : null}
          <View accessibilityRole="radiogroup" style={styles.reasons}>
            {REASONS.map((r) => {
              const selected = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setReason(r)}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityLabel={REASON_LABELS[r]}
                  accessibilityState={{ selected, checked: selected, disabled: busy }}
                  style={[
                    styles.reason,
                    { borderColor: selected ? colors.primary[600] : theme.border },
                  ]}
                >
                  <View
                    style={[
                      styles.radio,
                      { borderColor: selected ? colors.primary[600] : theme.textSecondary },
                    ]}
                  >
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={[styles.text, { color: theme.text }]}>{REASON_LABELS[r]}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            editable={!busy}
            multiline
            maxLength={2000}
            placeholder="Anmerkung (optional)"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Anmerkung (optional)"
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          />
          {error ? (
            <Text style={[styles.text, { color: colors.error[600] }]} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void submit()}
            disabled={!reason || busy}
            accessibilityRole="button"
            accessibilityLabel="Melden"
            accessibilityState={{ disabled: !reason || busy, busy }}
            style={[styles.button, { opacity: reason || busy ? 1 : 0.4 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>Melden</Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.small, paddingTop: spacing.xsmall },
  title: { fontFamily: HEADING_FONT_BOLD, fontSize: 18 },
  text: { fontFamily: BODY_FONT, fontSize: 15, lineHeight: 21, flexShrink: 1 },
  reasons: { gap: spacing.xsmall },
  reason: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.small,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary[600] },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    padding: spacing.small,
    fontFamily: BODY_FONT,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  button: {
    minHeight: 48,
    borderRadius: borderRadius.medium,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: BODY_FONT, fontSize: 16, fontWeight: '700', color: colors.white },
});
