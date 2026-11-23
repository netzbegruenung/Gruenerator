import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, StyleSheet } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, BODY_FONT } from '../../theme';

import { ProjectChatList } from './ProjectChatList';
import { projectChatRoute, resetForProjectChat } from './projectChatStart';
import { useProjekteTone } from './projekteTone';

/**
 * „Neuen Chat im Projekt starten": first message plus the Projekt go to the
 * chat screen, which creates the thread filed in the Projekt before the first
 * turn. „Im Projekt teilen" (default on) makes it a chat every member can read
 * and write in; off keeps it private but still uses the Projekt's knowledge.
 */
export function ProjectChatComposer({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  const router = useRouter();
  const theme = useTheme();
  const tone = useProjekteTone();
  const [text, setText] = useState('');
  const [teamShared, setTeamShared] = useState(true);
  const trimmed = text.trim();

  const start = () => {
    if (!trimmed) return;
    resetForProjectChat();
    router.push(projectChatRoute({ groupId, text: trimmed, teamShared }));
    setText('');
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
        Neuen Chat im Projekt starten
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={`Neuer Chat in ${groupName} …`}
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel={`Neuer Chat in ${groupName}`}
            style={[styles.input, { color: theme.text }]}
            multiline
            returnKeyType="send"
          />
          <Pressable
            onPress={start}
            disabled={!trimmed}
            accessibilityRole="button"
            accessibilityLabel="Chat im Projekt starten"
            style={[styles.send, { backgroundColor: tone.accent, opacity: trimmed ? 1 : 0.4 }]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.white} />
          </Pressable>
        </View>
      </View>
      {/* Eine Zeile wie im Web: links die bisherigen Chats, rechts der Schalter. */}
      <ProjectChatList
        groupId={groupId}
        aside={
          <View style={styles.teamRow}>
            <Text style={[styles.teamLabel, { color: theme.textSecondary }]}>
              Im Projekt teilen
            </Text>
            <Switch
              value={teamShared}
              onValueChange={setTeamShared}
              accessibilityLabel="Im Projekt teilen"
              trackColor={{ true: tone.accent }}
            />
          </View>
        }
        hint={
          teamShared ? null : (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Privat – nutzt trotzdem das Wissen des Projekts
            </Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xsmall },
  heading: { fontFamily: BODY_FONT, fontSize: 17, fontWeight: '700' },
  card: { borderRadius: 20, padding: spacing.small, gap: spacing.xsmall },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.small },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    fontFamily: BODY_FONT,
    fontSize: 15,
    paddingVertical: spacing.xsmall,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xsmall,
  },
  teamLabel: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '500' },
  hint: { fontFamily: BODY_FONT, fontSize: 12, textAlign: 'right' },
});
