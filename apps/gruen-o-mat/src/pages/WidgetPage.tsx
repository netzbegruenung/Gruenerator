import { GruenOMatModal } from '@gruenerator/chat';
import { useParams } from 'react-router-dom';

import { getNotebookByCollectionId } from '../config/notebooks';

export function WidgetPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const resolvedId = collectionId || 'gruene-de-system';
  const notebook = getNotebookByCollectionId(resolvedId);

  return (
    <div className="h-dvh w-full">
      <GruenOMatModal
        collectionId={resolvedId}
        collectionName={notebook?.name || 'gruene.de'}
        title={notebook?.name || 'Grün-O-Mat'}
        endpoint="/api/gruen-o-mat/stream"
      />
    </div>
  );
}
