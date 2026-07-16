import { DocumentsView } from '../../../components/docs/DocumentsView';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';

export default function DocumentsScreen() {
  return (
    <ScreenScaffold title="Dokumente">
      <DocumentsView />
    </ScreenScaffold>
  );
}
