import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { ToolsView } from '../../../components/tools/ToolsView';

export default function ToolsLauncher() {
  return (
    <ScreenScaffold title="Tools">
      <ToolsView />
    </ScreenScaffold>
  );
}
