import { useDebouncedSearch, useOwnStudioAssets } from '@gruenerator/shared/studio-assets';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useState, type JSX } from 'react';
import { PiImage, PiPlus, PiSticker, PiStorefront } from 'react-icons/pi';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { GalleryEmptyState } from '../../components/common/Gallery/parts';
import { PageHero, PageHeroSearch, PageShell } from '../../components/common/PageHero';

import { StudioAssetsDiscoverDialog } from './StudioAssetsDiscoverDialog';
import { StudioAssetSection } from './StudioAssetSection';
import { useStudioAssetActions } from './useStudioAssetActions';

const STUDIO_ASSETS_PATH = '/studio/sticker';
const DISCOVER_PATH = '/studio/sticker/entdecken';
const CREATE_PATH = '/studio/sticker/neu';

/** Wie bei der Agentura: Schließen führt per `navigate(-1)` zurück, wenn das Popup von hier kam. */
const FROM_OVERVIEW = { fromOverview: true } as const;

/**
 * „Sticker & Hintergründe“: die eigene Sammlung — selbst erstellt und gemerkt —
 * nach Art gegliedert. Was andere teilen, liegt im Entdecken-Popup darüber
 * (`discoverOpen`, Adresse `/studio/sticker/entdecken`).
 */
function StudioAssetsView({ discoverOpen }: { discoverOpen: boolean }): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchInput, setSearchInput] = useState('');
  const q = useDebouncedSearch(searchInput);
  const { handlers, openUpload, dialogs } = useStudioAssetActions();
  const stickers = useOwnStudioAssets('sticker', q);
  const backgrounds = useOwnStudioAssets('background', q);

  const sections = [
    { title: 'Sticker', ...stickers },
    { title: 'Hintergründe', ...backgrounds },
  ].filter((s) => s.data.isLoading || s.data.items.length > 0);
  const settled = stickers.settled && backgrounds.settled;
  const error = stickers.error ?? backgrounds.error;
  const total = stickers.data.items.length + backgrounds.data.items.length;

  const closeDiscover = () => {
    const state = location.state as { fromOverview?: boolean } | null;
    if (state?.fromOverview) void navigate(-1);
    else void navigate(STUDIO_ASSETS_PATH, { replace: true });
  };

  return (
    <PageShell wide>
      <PageHero
        title="Sticker & Hintergründe"
        description={
          <p className="m-0 text-sm leading-relaxed text-pretty text-grey-500 dark:text-grey-400">
            Deine Sticker und Hintergründe für Profilbild und Canvas. Was andere teilen, findest du
            unter Entdecken.
          </p>
        }
        toolbar={
          <>
            <PageHeroSearch
              query={searchInput}
              onQuery={setSearchInput}
              placeholder="Sticker und Hintergründe durchsuchen…"
            />
            <Button asChild variant="ghost" size="icon">
              <Link
                to={DISCOVER_PATH}
                state={FROM_OVERVIEW}
                aria-label="Entdecken"
                title="Entdecken"
              >
                <PiStorefront aria-hidden className="size-[18px]" />
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Neu" title="Neu">
                  <PiPlus aria-hidden className="size-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void navigate(CREATE_PATH)}>
                  <PiSticker />
                  <span>Sticker erstellen</span>
                </DropdownMenuItem>
                {/* Der Sticker-Creator macht nur Sticker; Hintergründe werden hochgeladen. */}
                <DropdownMenuItem onClick={openUpload}>
                  <PiImage />
                  <span>Hintergrund hochladen</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <span role="status" aria-live="polite" className="sr-only">
        {`${total} ${total === 1 ? 'Eintrag' : 'Einträge'}`}
      </span>

      {sections.length > 0 ? (
        <div className="flex flex-col gap-xl">
          {sections.map((s) => (
            <StudioAssetSection key={s.title} title={s.title} data={s.data} handlers={handlers} />
          ))}
        </div>
      ) : error ? (
        <GalleryEmptyState
          title="Deine Sticker konnten nicht geladen werden"
          hint="Lade die Seite neu oder versuch es gleich noch einmal."
        />
      ) : !settled ? null : q ? (
        <GalleryEmptyState
          title="Keine Treffer"
          hint="Bei deinen Stickern und Hintergründen ist nichts dabei — vielleicht unter Entdecken."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={`${DISCOVER_PATH}?q=${encodeURIComponent(q)}`} state={FROM_OVERVIEW}>
                Unter Entdecken suchen
              </Link>
            </Button>
          }
        />
      ) : (
        <GalleryEmptyState
          title="Noch keine Sticker oder Hintergründe"
          hint="Erstelle einen Sticker, lade einen Hintergrund hoch oder merke dir etwas unter Entdecken."
          action={
            <div className="flex flex-wrap items-center justify-center gap-sm">
              <Button asChild variant="brand" size="brand-sm">
                <Link to={CREATE_PATH}>
                  <PiPlus />
                  Sticker erstellen
                </Link>
              </Button>
              <Button variant="outline" size="brand-sm" onClick={openUpload}>
                <PiImage />
                Hintergrund hochladen
              </Button>
              <Button asChild variant="outline" size="brand-sm">
                <Link to={DISCOVER_PATH} state={FROM_OVERVIEW}>
                  <PiStorefront />
                  Entdecken
                </Link>
              </Button>
            </div>
          }
        />
      )}

      <StudioAssetsDiscoverDialog
        open={discoverOpen}
        onClose={closeDiscover}
        initialQuery={new URLSearchParams(location.search).get('q') ?? ''}
      />
      {dialogs}
    </PageShell>
  );
}

const StudioAssetsPage = (): JSX.Element => <StudioAssetsView discoverOpen={false} />;

/** `/studio/sticker/entdecken` — die Übersicht mit offenem Entdecken-Popup. */
export const StudioAssetsDiscoverPage = (): JSX.Element => <StudioAssetsView discoverOpen />;

export default StudioAssetsPage;
