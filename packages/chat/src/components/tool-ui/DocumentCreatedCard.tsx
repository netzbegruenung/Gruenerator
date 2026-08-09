import { ARTIFACT_TYPE_META, subtypeToArtifactKind } from '@gruenerator/shared/docs';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { memo, useState } from 'react';

import { useArtifactLiveStore } from '../../stores/artifactLiveStore';
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
function PdfOpenButton({ document, label }: { document: DocumentCreatedData; label: string }) {
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
      {label} öffnen
      <ExternalLink className="h-3.5 w-3.5" />
    </button>
  );
}

export const DocumentCreatedCard = memo(function DocumentCreatedCard({
  document,
}: {
  document: DocumentCreatedData;
}) {
  // The kind drives icon, accent and wording alike, so a new artifact type is
  // one registry entry rather than three ternaries drifting apart. The raw
  // subtype used to be printed here, which surfaced 'blank' to users.
  const kind = subtypeToArtifactKind(document.subtype);
  const meta = ARTIFACT_TYPE_META[kind];
  const Icon = meta.Icon;
  // The docked ArtifactPanel is only mounted on /chat; this card also renders
  // in the Sheets/Docs/Presentations assistant chats. Writing to the store
  // there would do nothing visible, so the primary action degrades to the old
  // plain link when no panel is around to react.
  const panelMounted = useArtifactLiveStore((s) => s.panelMounted);
  return (
    <div className="my-5 max-w-md rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg"
            style={{ background: meta.bg, color: meta.color }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{document.title}</p>
            <p className="text-xs text-foreground-muted">{meta.label}</p>
          </div>
        </div>
        {kind === 'pdf' ? (
          <PdfOpenButton document={document} label={meta.label} />
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0">
            {panelMounted ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    useArtifactLiveStore.getState().setActiveArtifact({
                      id: `document-${document.documentId}`,
                      type: 'document',
                      documentId: document.documentId,
                      subtype: document.subtype,
                      title: document.title,
                      url: document.url,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-primary text-white hover:bg-primary/90 transition-colors"
                >
                  {meta.label} öffnen
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <a
                  href={document.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
                  aria-label={`${meta.label} in neuem Tab öffnen`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </>
            ) : (
              <a
                href={document.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                {meta.label} öffnen
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
