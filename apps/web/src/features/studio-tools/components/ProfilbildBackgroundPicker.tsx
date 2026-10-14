import { GRADIENT_SWATCHES, type PresetDesign, type Swatch } from '@gruenerator/shared/profilbild';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@gruenerator/ui';
import { useState } from 'react';
import { PiUploadSimple } from 'react-icons/pi';

import { type GalleryAsset } from '../utils/galleryAsset';
import { flatCss } from '../utils/profilbildBackgrounds';

import { ProfilbildDiscoverButton } from './ProfilbildDiscoverDialog';
import { ProfilbildGalleryGrid } from './ProfilbildGalleryGrid';

export const TAB_CLS =
  'h-9 flex-none rounded-full border border-grey-200 px-md text-sm font-semibold text-foreground max-md:h-11 dark:border-grey-700 ' +
  'data-[state=active]:border-transparent data-[state=active]:bg-secondary-600 data-[state=active]:text-white data-[state=active]:shadow-none';

const RING =
  'outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-primary-600 aria-pressed:ring-offset-2';

const SWATCH_CLASS = `size-11 shrink-0 cursor-pointer rounded-full border border-grey-300 dark:border-grey-600 ${RING}`;
export const TILE_CLASS = `relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-grey-300 dark:border-grey-600 ${RING}`;

export const CUSTOM_ID = 'eigenes-bild';

/** Leere Kachel für Aktionen in einer Auswahlreihe — Hochladen, Entdecken. */
export const ACTION_TILE_CLASS =
  'flex size-16 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-grey-300 text-grey-600 outline-none transition-colors hover:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-grey-600 dark:text-grey-300';

type Category = 'farben' | 'vorlagen' | 'deine';

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
  const [tab, setTab] = useState<Category>(() =>
    presets.some((p) => p.id === selected)
      ? 'vorlagen'
      : selected === CUSTOM_ID
        ? 'deine'
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
          Farben
        </TabsTrigger>
        <TabsTrigger value="vorlagen" className={TAB_CLS}>
          Vorlagen
        </TabsTrigger>
        <TabsTrigger value="deine" className={TAB_CLS}>
          Deine
        </TabsTrigger>
      </TabsList>

      <TabsContent value="farben" className="flex flex-col gap-sm p-1 pt-sm">
        <div role="group" aria-label="Vollfarben" className="flex flex-wrap gap-sm">
          {colors.map(renderSwatch)}
        </div>
        <div role="group" aria-label="Verläufe" className="flex flex-wrap gap-sm">
          {GRADIENT_SWATCHES.map(renderSwatch)}
        </div>
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

      {/* Eigenes Foto, selbst erstellte und gemerkte Hintergründe in einer Reihe;
          Hochladen und Entdecken stehen als Kacheln dahinter. */}
      <TabsContent value="deine" className="flex flex-col gap-sm p-1 pt-sm">
        <ProfilbildGalleryGrid
          kind="background"
          source="own"
          tileClassName={TILE_CLASS}
          selectedSrc={selected === CUSTOM_ID ? (customUrl ?? '') : ''}
          onPick={onSelectGallery}
          leadingSrc={customUrl}
          leading={
            customImageSrc ? (
              <button
                type="button"
                aria-label="Eigenes Hintergrundbild"
                aria-pressed={selected === CUSTOM_ID}
                title="Eigenes Hintergrundbild"
                onClick={() => onSelect(CUSTOM_ID)}
                className={TILE_CLASS}
                style={{ background: `center / cover url("${customImageSrc}")` }}
              />
            ) : null
          }
          trailing={
            <>
              <button
                type="button"
                onClick={onUpload}
                aria-label="Bild hochladen"
                title="Bild hochladen"
                className={ACTION_TILE_CLASS}
              >
                <PiUploadSimple aria-hidden className="size-5" />
              </button>
              <ProfilbildDiscoverButton
                kind="background"
                buttonClassName={ACTION_TILE_CLASS}
                tileClassName={TILE_CLASS}
                onPick={onSelectGallery}
              />
            </>
          }
        />
        {onShareCustom ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={onShareCustom}
          >
            Im Bereich „Entdecken“ teilen
          </Button>
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
