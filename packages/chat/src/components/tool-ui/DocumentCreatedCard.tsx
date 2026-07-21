import { memo } from 'react';
import { FileText, Table2, ArrowRight } from 'lucide-react';
import type { DocumentCreatedData } from '../../types/messageMetadata';

export const DocumentCreatedCard = memo(function DocumentCreatedCard({
  document,
}: {
  document: DocumentCreatedData;
}) {
  const isSheet = document.subtype === 'sheets';
  const Icon = isSheet ? Table2 : FileText;
  return (
    <div className="my-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{document.title}</p>
            <p className="text-xs text-foreground-muted">{document.subtype}</p>
          </div>
        </div>
        <a
          href={document.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-primary text-white hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          {isSheet ? 'Tabelle öffnen' : 'Dokument öffnen'}
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
});
