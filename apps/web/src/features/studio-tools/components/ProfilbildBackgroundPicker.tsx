import { type StudioAssetScope } from '@gruenerator/contracts';
import { GRADIENT_SWATCHES, type PresetDesign, type Swatch } from '@gruenerator/shared/profilbild';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@gruenerator/ui';
import { useState } from 'react';

import { type GalleryAsset } from '../utils/galleryAsset';
import { flatCss } from '../utils/profilbildBackgrounds';

import { ProfilbildGalleryGrid } from './ProfilbildGalleryGrid';
import { TOOL_PILL } from './ToolUi';

import { cn } from '@/utils/cn';

export const TAB_CLS =
  'h-9 flex-none rounded-full border border-grey-200 px-md text-sm font-semibold text-foreground max-md:h-11 dark:border-grey-700 ' +
  'data-[state=active]:border-transparent data-[state=active]:bg-secondary-600 data-[state=active]:text-white data-[state=active]:shadow-none';

const RING =
  'outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-primary-600 aria-pressed:ring-offset-2';

const SWATCH_CLASS = `size-11 shrink-0 cursor-pointer rounded-full border border-grey-300 dark:border-grey-600 ${RING}`;
const TILE_CLASS = `relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-grey-300 dark:border-grey-600 ${RING}`;

export const CUSTOM_ID = 'eigenes-bild';

type Category = 'farben' | 'verlaeufe' | 'vorlagen' | 'entdecken' | 'eigenes';

const GALLERY_SCOPES: { value: StudioAssetScope; label: string }[] = [
  { value: 'shop', label: 'Öffentlich' },
  { value: 'mine', label: 'Meine' },
  { value: 'saved', label: 'Gemerkt' },
];

export interface ProfilbildBackgroundPickerProps {
  colors: Swatch[];
  presets: PresetDesign[];
  selected: string;
  customImageSrc: string | null;
  /** The stored share path of the custom background, if it has one yet. */
  customUrl: string | null;
  onSelect: (id: string) => void;
  onSelectPreset: (design: PresetDesign) => void;
  onSelectGallery: (item: GalleryAsset) => void;
  onUpload: () => void;
  /** Offered while the custom background is a freshly picked own photo. */
  onShareCustom: (() => void) | null;
}

export function ProfilbildBackgroundPicker({
  colors,
  presets,
  selected,
  customImageSrc,
  customUrl,
  onSelect,
  onSelectPreset,
  onSelectGallery,
  onUpload,
  onShareCustom,
}: ProfilbildBackgroundPickerProps) {
  const [galleryScope, setGalleryScope] = useState<StudioAssetScope>('shop');
  const [tab, setTab] = useState<Category>(() =>
    GRADIENT_SWATCHES.some((s) => s.id === selected)
      ? 'verlaeufe'
      : presets.some((p) => p.id === selected)
        ? 'vorlagen'
        : selected === CUSTOM_ID
          ? 'eigenes'
          : 'farben'
  );

  const renderSwatch = (s: Swatch) => (
    <button
      key={s.id}
      type="button"
      aria-label={s.label}
      aria-pressed={selected === s.id}
      title={s.label}
      onClick={() => onSelect(s.id)}
      className={SWATCH_CLASS}
      style={{ background: flatCss(s.background) }}
    />
  );

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Category)}>
      <TabsList
        aria-label="Hintergrund-Art"
        className="flex-wrap justify-start gap-xs bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto"
      >
        <TabsTrigger value="farben" className={TAB_CLS}>
          Vollfarben
        </TabsTrigger>
        <TabsTrigger value="verlaeufe" className={TAB_CLS}>
          Verläufe
        </TabsTrigger>
        <TabsTrigger value="vorlagen" className={TAB_CLS}>
          Vorlagen
        </TabsTrigger>
        <TabsTrigger value="entdecken" className={TAB_CLS}>
          Entdecken
        </TabsTrigger>
        <TabsTrigger value="eigenes" className={TAB_CLS}>
          Eigenes Bild
        </TabsTrigger>
      </TabsList>

      <TabsContent value="farben" className="flex flex-wrap gap-sm p-1 pt-sm">
        {colors.map(renderSwatch)}
      </TabsContent>

      <TabsContent value="verlaeufe" className="flex flex-wrap gap-sm p-1 pt-sm">
        {GRADIENT_SWATCHES.map(renderSwatch)}
      </TabsContent>

      <TabsContent value="vorlagen" className="flex flex-wrap gap-sm p-1 pt-sm">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={p.label}
            aria-pressed={selected === p.id}
            title={p.label}
            onClick={() => onSelectPreset(p)}
            className={TILE_CLASS}
            style={{
              background: flatCss(p.base),
            }}
          >
            {p.overlays.map((o) => (
              <img
                key={o.src}
                src={o.src}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute max-w-none -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${o.x * 100}%`,
                  top: `${o.y * 100}%`,
                  width: `${o.width * 100}%`,
                  opacity: o.opacity,
                }}
              />
            ))}
          </button>
        ))}
      </TabsContent>

      <TabsContent value="entdecken" className="flex flex-col gap-sm p-1 pt-sm">
        <div role="group" aria-label="Hintergründe aus der Galerie" className="flex gap-xs">
          {GALLERY_SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={galleryScope === s.value}
              onClick={() => setGalleryScope(s.value)}
              className={cn(TOOL_PILL, 'px-sm')}
            >
              {s.label}
            </button>
          ))}
        </div>
        <ProfilbildGalleryGrid
          key={galleryScope}
          kind="background"
          scope={galleryScope}
          tileClassName={TILE_CLASS}
          selectedSrc={selected === CUSTOM_ID ? (customUrl ?? '') : ''}
          onPick={onSelectGallery}
        />
      </TabsContent>

      <TabsContent value="eigenes" className="flex flex-wrap items-center gap-sm p-1 pt-sm">
        {customImageSrc ? (
          <>
            <button
              type="button"
              aria-label="Eigenes Hintergrundbild"
              aria-pressed={selected === CUSTOM_ID}
              title="Eigenes Hintergrundbild"
              onClick={() => onSelect(CUSTOM_ID)}
              className={TILE_CLASS}
              style={{ background: `center / cover url("${customImageSrc}")` }}
            />
            <Button type="button" size="sm" variant="outline" onClick={onUpload}>
              Anderes Bild wählen
            </Button>
            {onShareCustom ? (
              <Button type="button" size="sm" variant="ghost" onClick={onShareCustom}>
                Im Bereich ‚Entdecken‘ teilen
              </Button>
            ) : null}
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={onUpload}>
            Bild hochladen
          </Button>
        )}
      </TabsContent>
    </Tabs>
  );
}
