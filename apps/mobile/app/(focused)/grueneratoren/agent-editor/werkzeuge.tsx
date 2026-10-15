import { USER_SELECTABLE_TOOLS } from '@gruenerator/shared/agents';

import { toggleIn } from '../../../../components/agentura/editor/agentEditorLogic';
import { EditorSubPage, RowSwitch } from '../../../../components/agentura/editor/EditorSubPage';
import { FormSection } from '../../../../components/agentura/recipe-editor/FormParts';
import { ListRow } from '../../../../components/common';
import { useAgentEditorStore } from '../../../../stores/agentEditorStore';

export default function AgentToolsPage() {
  const enabledTools = useAgentEditorStore((s) => s.form.enabledTools);
  const inlineSourceLinks = useAgentEditorStore((s) => s.form.inlineSourceLinks);
  const patch = useAgentEditorStore((s) => s.patch);

  return (
    <EditorSubPage title="Werkzeuge">
      <FormSection title="Werkzeuge" footer="Wähle, was der Agent im Gespräch nutzen darf.">
        {USER_SELECTABLE_TOOLS.map((tool, i) => {
          const on = enabledTools.includes(tool.key);
          const toggle = () => patch({ enabledTools: toggleIn(enabledTools, tool.key) });
          return (
            <ListRow
              key={tool.key}
              dense
              title={tool.label}
              value={tool.description}
              valueLines={3}
              onPress={toggle}
              accessory={<RowSwitch value={on} onValueChange={toggle} label={tool.label} />}
              last={i === USER_SELECTABLE_TOOLS.length - 1}
            />
          );
        })}
      </FormSection>

      <FormSection title="Quellen">
        <ListRow
          dense
          title="Quell-Links im Antworttext"
          value="Für versandfertige E-Mails und Briefe: konkrete Artikel-URLs aus der Recherche erscheinen direkt im Text statt nur als Quellen-Karten."
          valueLines={4}
          onPress={() => patch({ inlineSourceLinks: !inlineSourceLinks })}
          accessory={
            <RowSwitch
              value={inlineSourceLinks}
              onValueChange={(v) => patch({ inlineSourceLinks: v })}
              label="Quell-Links im Antworttext"
            />
          }
          last
        />
      </FormSection>
    </EditorSubPage>
  );
}
