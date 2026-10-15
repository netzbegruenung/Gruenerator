import { EditorSubPage } from '../../../../components/agentura/editor/EditorSubPage';
import { IconPickerGrid } from '../../../../components/agentura/IconPickerGrid';
import { useAgentEditorStore } from '../../../../stores/agentEditorStore';

export default function AgentIconPage() {
  const iconKey = useAgentEditorStore((s) => s.form.iconKey);
  const patch = useAgentEditorStore((s) => s.patch);
  return (
    <EditorSubPage title="Symbol">
      <IconPickerGrid value={iconKey} onChange={(next) => patch({ iconKey: next })} />
    </EditorSubPage>
  );
}
