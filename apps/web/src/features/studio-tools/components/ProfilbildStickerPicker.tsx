import { type StudioAssetScope } from '@gruenerator/contracts';
import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { stickersForLocale, type ProfilbildSticker } from '@gruenerator/shared/profilbild';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@gruenerator/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { type GalleryAsset } from '../utils/galleryAsset';

import { TAB_CLS } from './ProfilbildBackgroundPicker';
import { ProfilbildGalleryGrid } from './ProfilbildGalleryGrid';

const STICKER_TILE_CLASS =
  'flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-grey-300 p-1 outline-none transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-grey-600';
// Gallery stickers are transparent cut-outs: a checkerboard keeps their edge visible.
const SHOP_TILE_CLASS =
  `${STICKER_TILE_CLASS} bg-[repeating-conic-gradient(#ececec_0%_25%,#ffffff_0%_50%)] bg-[length:12px_12px] ` +
  'dark:bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#1f1f1f_0%_50%)]';

const SHOP_TABS: { value: StudioAssetScope; label: string }[] = [
  { value: 'shop', label: 'Entdecken' },
  { value: 'mine', label: 'Meine' },
  { value: 'saved', label: 'Gemerkt' },
];

type StickerTab = 'gruene' | StudioAssetScope;

export interface ProfilbildStickerPickerProps {
  locale: 'de-DE' | 'de-AT';
  disabled: boolean;
  onAddSystem: (sticker: ProfilbildSticker) => void;
  onAddAsset: (item: GalleryAsset) => void;
}

export function ProfilbildStickerPicker({
  locale,
  disabled,
  onAddSystem,
  onAddAsset,
}: ProfilbildStickerPickerProps) {
  const [tab, setTab] = useState<StickerTab>('gruene');

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as StickerTab)}>
      <div className="flex flex-wrap items-center justify-between gap-xs">
        <TabsList
          aria-label="Sticker-Auswahl"
          className="flex-wrap justify-start gap-xs bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto"
        >
          <TabsTrigger value="gruene" className={TAB_CLS}>
            Grüne
          </TabsTrigger>
          {SHOP_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className={TAB_CLS}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <Button asChild size="sm" variant="ghost">
          <Link to="/studio/sticker/neu?return=profilbild">Sticker erstellen</Link>
        </Button>
      </div>

      <TabsContent value="gruene" className="flex flex-wrap gap-sm p-1 pt-sm">
        {stickersForLocale(locale).map((st) => (
          <button
            key={st.id}
            type="button"
            aria-label={`Sticker ${st.label} hinzufügen`}
            title={st.label}
            disabled={disabled}
            onClick={() => onAddSystem(st)}
            className={STICKER_TILE_CLASS}
            style={{ background: CANVAS_COLORS.TANNE }}
          >
            <img src={st.src} alt="" aria-hidden="true" className="max-h-full max-w-full" />
          </button>
        ))}
      </TabsContent>

      {SHOP_TABS.map((t) => (
        <TabsContent key={t.value} value={t.value} className="p-1 pt-sm">
          <ProfilbildGalleryGrid
            kind="sticker"
            scope={t.value}
            tileClassName={SHOP_TILE_CLASS}
            disabled={disabled}
            onPick={onAddAsset}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
