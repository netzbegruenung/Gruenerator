import { FileText, Table2, ArrowRight, FileDown } from 'lucide-react';
import { memo, useState } from 'react';

import { downloadBlob } from '../../lib/downloadBlob';
import { useChatConfigStore } from '../../stores/chatConfigStore';

import type { DocumentCreatedData } from '../../types/messageMetadata';

/** PDF assets are AUTHENTICATED endpoints (cookies on web, Bearer on desktop),
 *  so the download goes through the injected config fetch → blob — a plain
 *  <a href download> carries no Bearer and fails on desktop. Same pattern as
 *  ComputeCard's asset downloads. Assets expire after 90 days → error state. */
function PdfDownloadButton({ document }: { document: DocumentCreatedData }) {
  const [unavailable, setUnavailable] = useState(false);

  const handleDownload = async () => {
    try {
      const { fetch: configFetch } = useChatConfigStore.getState();
      const response = await configFetch(document.url, { method: 'GET' });
      if (!response.ok) {
        setUnavailable(true);
        return;
      }
      downloadBlob(await response.blob(), `${document.title}.pdf`);
    } catch {
      setUnavailable(true);
    }
  };

  if (unavailable) {
    return (
      <span className="text-xs text-foreground-muted flex-shrink-0">
        Download nicht mehr verfügbar
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-primary text-white hover:bg-primary/90 transition-colors flex-shrink-0"
    >
      PDF herunterladen
      <FileDown className="h-3.5 w-3.5" />
    </button>
  );
}

export const DocumentCreatedCard = memo(function DocumentCreatedCard({
  document,
}: {
  document: DocumentCreatedData;
}) {
  const isSheet = document.subtype === 'sheets';
  const isPdf = document.subtype === 'pdf';
  const Icon = isPdf ? FileDown : isSheet ? Table2 : FileText;
  return (
    <div className="my-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{document.title}</p>
            <p className="text-xs text-foreground-muted">{isPdf ? 'PDF' : document.subtype}</p>
          </div>
        </div>
        {isPdf ? (
          <PdfDownloadButton document={document} />
        ) : (
          <a
            href={document.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-primary text-white hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            {isSheet ? 'Tabelle öffnen' : 'Dokument öffnen'}
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
});
