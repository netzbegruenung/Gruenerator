import { DocumentsView } from '../../../components/docs/DocumentsView';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { useOfficeExtraItems } from '../../../components/office/useOfficeExtraItems';

export default function OfficeScreen() {
  const { items } = useOfficeExtraItems();
  return (
    <ScreenScaffold title="Office">
      <DocumentsView extraItems={items} />
    </ScreenScaffold>
  );
}
