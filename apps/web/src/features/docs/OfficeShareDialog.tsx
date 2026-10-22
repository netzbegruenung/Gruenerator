import { lazy, Suspense } from 'react';

import { isCanvasDeck } from './canvasDeckActions';

const LazyShareModal = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ShareModal }))
);
const LazyShareCanvasDialog = lazy(() =>
  import('../image-studio/components/ShareCanvasDialog').then((m) => ({
    default: m.ShareCanvasDialog,
  }))
);

export interface OfficeShareTarget {
  id: string;
  title: string;
  documentSubtype: string | null;
}

/**
 * Teilen aus der Office-Bibliothek. Canvas-Folien teilen über den Canvas-Dialog:
 * der Docs-ShareModal verlinkt /office/<id> (BlockNote) und bietet „Als Vorlage
 * speichern" über die Docs-Route an — beides passt nicht zu einem Canvas.
 */
export function OfficeShareDialog({
  target,
  onClose,
}: {
  target: OfficeShareTarget;
  onClose: () => void;
}) {
  return (
    <Suspense fallback={null}>
      {isCanvasDeck(target.documentSubtype) ? (
        <LazyShareCanvasDialog
          canvasId={target.id}
          open
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        />
      ) : (
        <LazyShareModal documentId={target.id} documentTitle={target.title} onClose={onClose} />
      )}
    </Suspense>
  );
}
