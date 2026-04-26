import { useDocumentSharing } from '../../../hooks/useDocumentSharing';

export const useCanvasSharing = (canvasId: string) => {
  const sharing = useDocumentSharing(canvasId, { namespace: 'canvas' });
  return {
    ...sharing,
    canvasGroups: sharing.documentGroups,
  };
};
