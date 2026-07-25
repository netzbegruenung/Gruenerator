import { FileText, Table2, ArrowRight, FileDown, ExternalLink } from 'lucide-react';
import { memo, useState } from 'react';

import { useChatConfigStore } from '../../stores/chatConfigStore';

import type { DocumentCreatedData } from '../../types/messageMetadata';

/** Keep the object URL alive long enough for the viewer to load it — revoking
 *  right after navigation blanks the freshly opened tab. */
const OBJECT_URL_TTL_MS = 60_000;

/** PDF assets are AUTHENTICATED endpoints (cookies on web, Bearer on desktop),
 *  so the bytes go through the injected config fetch → blob; a plain <a href>
 *  carries no Bearer and fails on desktop. The blob then opens in a NEW TAB
 *  rather than downloading: the server sends `Content-Disposition: inline`, so
 *  the browser's PDF viewer renders it and offers its own download, instead of
 *  dropping a file the user never asked for. Assets expire after 90 days →
 *  error state. */
function PdfOpenButton({ document }: { document: DocumentCreatedData }) {
  const [unavailable, setUnavailable] = useState(false);

  const handleOpen = async () => {
    // Opened synchronously on the click itself: a window.open AFTER an await is
    // no longer user-initiated and gets popup-blocked. Deliberately WITHOUT
    // 'noopener' — that would make window.open return null, and we need the
    // handle to navigate it once the blob is ready (opener is cleared below).
    const tab = window.open('', '_blank');
    try {
      const { fetch: configFetch } = useChatConfigStore.getState();
      const response = await configFetch(document.url, { method: 'GET' });
      if (!response.ok) {
        tab?.close();
        setUnavailable(true);
        return;
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      if (tab) {
        tab.opener = null;
        tab.location.href = blobUrl;
      } else {
        // Blocked despite the synchronous open — best effort.
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), OBJECT_URL_TTL_MS);
    } catch {
      tab?.close();
      setUnavailable(true);
    }
  };

  if (unavailable) {
    return (
      <span className="text-xs text-foreground-muted flex-shrink-0">PDF nicht mehr verfügbar</span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void handleOpen()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-primary text-white hover:bg-primary/90 transition-colors flex-shrink-0"
    >
      PDF öffnen
      <ExternalLink className="h-3.5 w-3.5" />
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
          <PdfOpenButton document={document} />
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
