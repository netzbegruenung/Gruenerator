import { useGroupStart } from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, StyleSheet } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, BODY_FONT } from '../../theme';

import { projectChatRoute, resetForProjectChat } from './projectChatStart';
import { useProjekteTone } from './projekteTone';

/**
 * „Neuer Chat in <Projekt>": first message plus the Projekt go to the chat
 * screen, which creates the thread filed in the Projekt before the first turn.
 * In a team Projekt „Für das Team" (default on) makes it a team chat every
 * member can read and write in; personal Projekte have no such switch.
 */
export function ProjectChatComposer({
  groupId,
  groupName,
  solo,
}: {
  groupId: string;
  groupName: string;
  /** Personal or system Projekt: nobody to share a chat with. */
  solo: boolean;
}) {
  const router = useRouter();
  const theme = useTheme();
  const tone = useProjekteTone();
  const [text, setText] = useState('');
  const [teamShared, setTeamShared] = useState(true);
  const trimmed = text.trim();

  const { data: projectStart } = useGroupStart(groupId);
  const welcome = projectStart?.welcomeMessage ?? '';
  const questions = projectStart?.startQuestions ?? [];

  const startWith = (message: string) => {
    resetForProjectChat();
    router.push(projectChatRoute({ groupId, text: message, teamShared, solo }));
    setText('');
  };
  const start = () => {
    if (trimmed) startWith(trimmed);
  };

  return (
    <>
      {welcome || questions.length > 0 ? (
        <View style={styles.startBlock}>
          {welcome ? <Text style={[styles.welcome, { color: theme.text }]}>{welcome}</Text> : null}
          <View style={styles.questions}>
            {questions.map((question) => (
              <Pressable
                key={question}
                onPress={() => startWith(question)}
                accessibilityRole="button"
                accessibilityLabel={question}
                style={[styles.question, { backgroundColor: theme.card }]}
              >
                <Text style={[styles.questionText, { color: theme.text }]}>{question}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
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
        {solo ? null : (
          <View style={styles.teamRow}>
            <Switch
              value={teamShared}
              onValueChange={setTeamShared}
              accessibilityLabel="Für das Team"
              trackColor={{ true: tone.accent }}
            />
            <Text style={[styles.teamLabel, { color: theme.textSecondary }]}>Für das Team</Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  startBlock: { gap: spacing.small },
  welcome: { fontFamily: BODY_FONT, fontSize: 15, lineHeight: 22 },
  questions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall },
  question: { borderRadius: 20, paddingHorizontal: spacing.medium, paddingVertical: spacing.small },
  questionText: { fontFamily: BODY_FONT, fontSize: 14 },
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
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xsmall },
  teamLabel: { fontFamily: BODY_FONT, fontSize: 13 },
});
