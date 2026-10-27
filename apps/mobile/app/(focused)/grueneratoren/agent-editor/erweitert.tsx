import {
  currentModelId,
  MODEL_OPTIONS,
} from '../../../../components/agentura/editor/agentEditorLogic';
import { EditorSubPage } from '../../../../components/agentura/editor/EditorSubPage';
import { FieldInput, FormSection } from '../../../../components/agentura/recipe-editor/FormParts';
import { ListRow } from '../../../../components/common';
import { useAgentEditorStore } from '../../../../stores/agentEditorStore';

const REGIONS = [
  { value: 'de-DE', title: 'Deutschland' },
  { value: 'de-AT', title: 'Österreich' },
] as const;

export default function AgentAdvancedPage() {
  const form = useAgentEditorStore((s) => s.form);
  const patch = useAgentEditorStore((s) => s.patch);
  const modelId = currentModelId(form);

  return (
    <EditorSubPage title="Erweitert">
      <FormSection title="Region" footer="Bestimmt Sprache und Länderkontext des Agents.">
        {REGIONS.map((r, i) => (
          <ListRow
            key={r.value}
            dense
            title={r.title}
            value={r.value}
            selected={form.locale === r.value}
            onPress={() => patch({ locale: r.value })}
            last={i === REGIONS.length - 1}
          />
        ))}
      </FormSection>

      <FormSection title="Modell">
        {MODEL_OPTIONS.map((m, i) => (
          <ListRow
            key={m.id}
            dense
            title={m.name}
            value={m.description}
            valueLines={2}
            selected={modelId === m.id}
            onPress={() => patch({ model: m.model, provider: m.provider })}
            last={i === MODEL_OPTIONS.length - 1}
          />
        ))}
      </FormSection>

      <FormSection title="Tags" footer="Kommagetrennt, z. B. Klima, Verkehr.">
        <FieldInput
          value={form.tags}
          onChangeText={(t) => patch({ tags: t })}
          placeholder="Klima, Verkehr"
          accessibilityLabel="Tags, kommagetrennt"
          autoCapitalize="none"
        />
      </FormSection>
    </EditorSubPage>
  );
}
