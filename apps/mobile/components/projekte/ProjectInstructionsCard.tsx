import { useGroupInstructions } from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';

import { useProjekteTone } from './projekteTone';

/** Bis zu dieser Länge steht der Text ganz da, darüber gekürzt (wie im Web). */
const PREVIEW_MAX_CHARS = 300;
const preview = (text: string) => {
  const t = text.trim();
  return t.length <= PREVIEW_MAX_CHARS ? t : `${t.slice(0, PREVIEW_MAX_CHARS).trimEnd()}…`;
};

/**
 * „Anweisungen“: der Text, der für jeden Chat im Projekt gilt. In der App nur
 * zum Lesen (bearbeiten bleibt im Web); ohne Text gibt es keine Karte.
 */
export function ProjectInstructionsCard({ groupId }: { groupId: string }) {
  const theme = useTheme();
  const tone = useProjekteTone();
  const { data: instructions = '' } = useGroupInstructions(groupId);
  if (!instructions.trim()) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.head}>
        <Ionicons name="options-outline" size={18} color={tone.accent} />
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          Anweisungen
        </Text>
      </View>
      <Text style={[styles.body, { color: theme.text }]}>{preview(instructions)}</Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Gilt für jeden Chat in diesem Projekt.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: BODY_FONT, fontSize: 17, fontWeight: '700' },
  body: { fontFamily: BODY_FONT, fontSize: 15, lineHeight: 22 },
  hint: { fontFamily: BODY_FONT, fontSize: 12 },
});
