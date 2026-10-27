import { toggleIn } from '../../../../components/agentura/editor/agentEditorLogic';
import { EditorSubPage, RowSwitch } from '../../../../components/agentura/editor/EditorSubPage';
import {
  useNotebookChoices,
  type NotebookChoice,
} from '../../../../components/agentura/editor/useEditorChoices';
import { FormSection } from '../../../../components/agentura/recipe-editor/FormParts';
import { ListRow, SkeletonRows } from '../../../../components/common';
import { useAgentEditorStore } from '../../../../stores/agentEditorStore';

export default function AgentKnowledgePage() {
  const selected = useAgentEditorStore((s) => s.form.defaultNotebookIds);
  const patch = useAgentEditorStore((s) => s.patch);
  const { system, own, ownLoading } = useNotebookChoices(selected);

  const rows = (list: NotebookChoice[]) =>
    list.map((nb, i) => {
      const on = selected.includes(nb.id);
      const toggle = () => patch({ defaultNotebookIds: toggleIn(selected, nb.id) });
      return (
        <ListRow
          key={nb.id}
          dense
          title={nb.title}
          onPress={toggle}
          accessory={<RowSwitch value={on} onValueChange={toggle} label={nb.title} />}
          last={i === list.length - 1}
        />
      );
    });

  return (
    <EditorSubPage title="Wissen">
      <FormSection
        title="Grünerator-Notebooks"
        footer="Notebooks, die der Agent automatisch als Wissensquelle durchsucht. Mehrfachauswahl möglich."
      >
        {rows(system)}
      </FormSection>
      {ownLoading ? (
        <SkeletonRows count={2} leading={0} meta={false} />
      ) : own.length > 0 ? (
        <FormSection title="Meine Notebooks">{rows(own)}</FormSection>
      ) : null}
    </EditorSubPage>
  );
}
