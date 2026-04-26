import { useDocumentSharing } from '../../../hooks/useDocumentSharing';

export const useBoardSharing = (boardId: string) => {
  const sharing = useDocumentSharing(boardId, {
    namespace: 'docs',
    extraInvalidationKeys: [['boards', boardId, 'assignable-members']],
  });
  return {
    ...sharing,
    boardGroups: sharing.documentGroups,
  };
};
