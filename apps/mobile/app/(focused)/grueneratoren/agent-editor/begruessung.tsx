import { StyleSheet } from 'react-native';

import { EditorSubPage } from '../../../../components/agentura/editor/EditorSubPage';
import { FieldInput, FormSection } from '../../../../components/agentura/recipe-editor/FormParts';
import { useAgentEditorStore } from '../../../../stores/agentEditorStore';

export default function AgentGreetingPage() {
  const openingMessage = useAgentEditorStore((s) => s.form.openingMessage);
  const openingQuestions = useAgentEditorStore((s) => s.form.openingQuestions);
  const patch = useAgentEditorStore((s) => s.patch);

  return (
    <EditorSubPage title="Begrüßung & Startfragen">
      <FormSection title="Begrüßungstext" footer="Optional. Erscheint zu Beginn eines neuen Chats.">
        <FieldInput
          value={openingMessage}
          onChangeText={(t) => patch({ openingMessage: t })}
          placeholder="Hallo! Ich helfe dir bei …"
          accessibilityLabel="Begrüßungstext"
          multiline
          style={styles.input}
        />
      </FormSection>
      <FormSection
        title="Startfragen"
        footer="Optional. Eine Frage pro Zeile — sie erscheinen als Vorschläge im leeren Chat."
      >
        <FieldInput
          value={openingQuestions}
          onChangeText={(t) => patch({ openingQuestions: t })}
          placeholder={'Was kann ich für dich tun?\nWorüber soll ich schreiben?'}
          accessibilityLabel="Startfragen, eine pro Zeile"
          multiline
          style={styles.input}
        />
      </FormSection>
    </EditorSubPage>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 120 },
});
