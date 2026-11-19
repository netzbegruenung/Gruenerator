import {
  buildSitePreviewSnapshot,
  siteDraftToSnapshotSource,
  type SupportedLocale,
} from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { Button } from '@gruenerator/ui';
import { useMemo, useState } from 'react';

import { LoadErrorState } from '../components/common/LoadErrorState';
import { EditorLayout, SectionNavigation } from '../components/editor';
import { SiteDraftProvider, useDraft } from '../draft/SiteDraftContext';
import { useSiteDraftSession } from '../draft/useSiteDraftSession';
import { useLeaveWarning } from '../hooks/useLeaveWarning';
import { type SiteData } from '../hooks/useSite';
import { SitePreviewFrame } from '../preview/SitePreviewFrame';
import { useAuth } from '../SitesContext';

import { EditorHeader } from './EditorHeader';

type PreviewDevice = 'desktop' | 'tablet' | 'phone';

function DraftPreview({ site }: { site: SiteData }) {
  const { user } = useAuth();
  const locale: SupportedLocale = user?.locale ?? 'de-DE';
  const draft = useDraft((d) => d);
  const snapshot = useMemo(
    () => buildSitePreviewSnapshot(siteDraftToSnapshotSource(draft, site.legal), locale),
    [draft, site.legal, locale]
  );
  return (
    <SitePreviewFrame
      snapshot={snapshot}
      handle={site.subdomain}
      title="Vorschau der Website"
      className="block h-full w-full border-0"
    />
  );
}

function FullscreenPreview({ site, onClose }: { site: SiteData; onClose: () => void }) {
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  return (
    <div className="fixed inset-y-0 right-0 left-[var(--sidebar-collapsed-width)] z-[1000] bg-background-pure flex flex-col">
      <div className="flex flex-wrap justify-between items-center py-sm px-md bg-primary-600 text-white shadow-md shrink-0 gap-sm md:px-lg">
        <span className="font-semibold text-sm md:text-base">Vorschau</span>
        <div className="flex gap-xs">
          {(
            [
              ['desktop', 'Desktop'],
              ['tablet', 'Tablet'],
              ['phone', 'Handy'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={device === value ? 'secondary' : 'outline'}
              aria-pressed={device === value}
              onClick={() => setDevice(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button variant="secondary" onClick={onClose}>
          Schließen
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden bg-grey-200 dark:bg-grey-700 flex justify-center">
        <div
          className={cn(
            'bg-background-pure h-full min-h-0 overflow-hidden transition-[width] duration-300',
            device === 'desktop' && 'w-full',
            device === 'tablet' && 'w-[768px] max-w-full shadow-lg',
            device === 'phone' && 'w-[375px] max-w-full shadow-lg'
          )}
          style={{ containerType: 'inline-size', containerName: 'preview' }}
        >
          <DraftPreview site={site} />
        </div>
      </div>
    </div>
  );
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
              sidebar={<SectionNavigation className="lg:hidden" />}
              preview={<DraftPreview site={site} />}
            />
            {previewOpen && <FullscreenPreview site={site} onClose={() => setPreviewOpen(false)} />}
          </div>
        </SiteDraftProvider>
      );
  }
}
