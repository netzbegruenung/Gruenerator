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
import { Link, useNavigate } from 'react-router-dom';

import { GalleryEmptyState } from '../../components/common/Gallery/parts';
import { PageHero, PageHeroSearch, PageShell } from '../../components/common/PageHero';
import { MarketplaceDialog } from '../marketplace/MarketplaceDialog';

import { StudioAssetSection } from './StudioAssetSection';
import { useStudioAssetActions } from './useStudioAssetActions';

const CREATE_PATH = '/studio/sticker/neu';

/** Im Marktplatz-Popup über der Sammlung gibt es nur Sticker und Hintergründe. */
const MARKET_KINDS = ['sticker', 'background'] as const;

/**
 * „Sticker & Hintergründe“: die eigene Sammlung — selbst erstellt und gemerkt —
 * nach Art gegliedert. Was andere teilen, liegt unter „Entdecken“ im
 * Marktplatz, als Popup darüber.
 */
function StudioAssetsPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  // `null` = zu; sonst die Suche, mit der das Popup aufgeht.
  const [discover, setDiscover] = useState<{ q: string } | null>(null);
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
            <Button
              variant="ghost"
              size="icon"
              aria-label="Entdecken"
              title="Entdecken"
              onClick={() => setDiscover({ q: '' })}
            >
              <PiStorefront aria-hidden className="size-[18px]" />
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
            <Button variant="outline" size="sm" onClick={() => setDiscover({ q })}>
              Unter Entdecken suchen
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
              <Button variant="outline" size="brand-sm" onClick={() => setDiscover({ q: '' })}>
                <PiStorefront />
                Entdecken
              </Button>
            </div>
          }
        />
      )}

      <MarketplaceDialog
        open={discover !== null}
        onOpenChange={(open) => !open && setDiscover(null)}
        kinds={MARKET_KINDS}
        initialQuery={discover?.q ?? ''}
        title="Entdecken"
      />
      {dialogs}
    </PageShell>
  );
}

export default StudioAssetsPage;
