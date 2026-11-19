import {
  buildSitePreviewSnapshot,
  siteDraftToSnapshotSource,
  type SupportedLocale,
} from '@gruenerator/contracts';
import { useMemo, useState } from 'react';

import { LoadErrorState } from '../components/common/LoadErrorState';
import { EditorLayout, EditorSidebar } from '../components/editor';
import { SiteDraftProvider, useDraft } from '../draft/SiteDraftContext';
import { useSiteDraftSession } from '../draft/useSiteDraftSession';
import { useLeaveWarning } from '../hooks/useLeaveWarning';
import { type SiteData } from '../hooks/useSite';
import { SitePreviewFrame } from '../preview/SitePreviewFrame';
import {
  usePreviewClickToEdit,
  usePreviewHighlight,
  usePreviewScrollSync,
} from '../preview/usePreviewInteractions';
import { useAuth } from '../SitesContext';

import { EditorHeader } from './EditorHeader';
import { PreviewDialog } from './PreviewDialog';

function DraftPreview({ site, editable }: { site: SiteData; editable: boolean }) {
  const { user } = useAuth();
  const locale: SupportedLocale = user?.locale ?? 'de-DE';
  const draft = useDraft((d) => d);
  const [frameDoc, setFrameDoc] = useState<Document | null>(null);
  const snapshot = useMemo(
    () => buildSitePreviewSnapshot(siteDraftToSnapshotSource(draft, site.legal), locale),
    [draft, site.legal, locale]
  );
  return (
    <>
      {editable && <PreviewInteractions doc={frameDoc} />}
      <SitePreviewFrame
        snapshot={snapshot}
        handle={site.subdomain}
        title="Vorschau der Website"
        className="block h-full w-full border-0"
        editable={editable}
        onFrameDocument={setFrameDoc}
      />
    </>
  );
}

function PreviewInteractions({ doc }: { doc: Document | null }) {
  usePreviewClickToEdit(doc);
  usePreviewScrollSync(doc);
  usePreviewHighlight(doc);
  return null;
}

export function SiteEditor({ site }: { site: SiteData }) {
  const session = useSiteDraftSession(site.id);
  const [previewOpen, setPreviewOpen] = useState(false);
  useLeaveWarning(session.state === 'ready' && session.save !== 'saved');

  switch (session.state) {
    case 'preparing':
    case 'connecting':
      return (
        <div className="flex flex-col items-center justify-center min-h-full gap-4 text-grey-600 dark:text-grey-400">
          <div className="w-10 h-10 border-[3px] border-grey-200 dark:border-grey-700 border-t-primary-600 rounded-full animate-spin" />
          <p>Entwurf wird geöffnet …</p>
        </div>
      );
    case 'unavailable':
      return (
        <LoadErrorState title="Der Entwurf ist gerade nicht erreichbar" onRetry={session.retry} />
      );
    case 'error':
      return <LoadErrorState onRetry={session.retry} />;
    case 'tooLarge':
      return (
        <LoadErrorState
          title="Entwurf zu groß"
          message="Dein Entwurf überschreitet die erlaubte Größe. Entferne Bilder oder Texte und lade die Seite neu."
        />
      );
    case 'ready':
      return (
        <SiteDraftProvider ydoc={session.ydoc}>
          <div className="min-h-full flex flex-col bg-grey-100 dark:bg-grey-800">
            <EditorHeader save={session.save} onPreview={() => setPreviewOpen(true)} />
            <EditorLayout
              sidebar={<EditorSidebar />}
              preview={<DraftPreview site={site} editable />}
            />
            <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen}>
              <DraftPreview site={site} editable={false} />
            </PreviewDialog>
          </div>
        </SiteDraftProvider>
      );
  }
}
