import { memo } from 'react';
import { FiExternalLink, FiZap } from 'react-icons/fi';

import { useBoardCardDocuments } from '../hooks/useBoardCardDocuments';

interface CardAgentDocumentsProps {
  boardId: string;
  cardId: string;
}

/**
 * "Grünerator-Dokumente" — documents the board agent created for this card.
 * Backed by the board_card_documents table (reliable), separate from the manual
 * "Dokumente"/Verknüpfen list. Renders nothing until at least one doc exists.
 */
export const CardAgentDocuments = memo(function CardAgentDocuments({
  boardId,
  cardId,
}: CardAgentDocumentsProps) {
  const { documentsQuery, unlink } = useBoardCardDocuments(boardId, cardId);
  const documents = documentsQuery.data ?? [];

  if (documents.length === 0) return null;

  return (
    <div className="flex flex-row items-start">
      <p className="w-24 shrink-0 text-sm font-medium text-grey-500 dark:text-grey-100 pt-0.5">
        <FiZap className="inline mr-1.5" size={13} />
        Grünerator-Dokumente
      </p>
      <div className="flex-1 flex flex-col gap-1.5">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center gap-1.5 group/doc">
            <a
              href={doc.url}
              className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline truncate flex-1"
            >
              <FiExternalLink size={12} className="shrink-0" />
              {doc.title}
            </a>
            <button
              onClick={() => unlink.mutate(doc.id)}
              disabled={unlink.isPending}
              className="sm:opacity-0 sm:group-hover/doc:opacity-100 text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer transition-opacity text-xs p-2 sm:p-0"
              title="Aus dieser Karte entfernen (Dokument bleibt erhalten)"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});
