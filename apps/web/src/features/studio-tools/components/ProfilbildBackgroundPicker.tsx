import {
  FREE_BACKGROUND_ID,
  type FreeBackground,
  type PresetDesign,
  type Swatch,
} from '@gruenerator/shared/profilbild';

import { type GalleryAsset } from '../utils/galleryAsset';
import { flatCss } from '../utils/profilbildBackgrounds';

import { ProfilbildDiscoverButton } from './ProfilbildDiscoverDialog';
import { ProfilbildFreeColor } from './ProfilbildFreeColor';
import { ProfilbildGalleryGrid } from './ProfilbildGalleryGrid';

export const TAB_CLS =
  'h-9 flex-none rounded-full border border-grey-200 px-md text-sm font-semibold text-foreground max-md:h-11 dark:border-grey-700 ' +
  'data-[state=active]:border-transparent data-[state=active]:bg-secondary-600 data-[state=active]:text-white data-[state=active]:shadow-none';

// Unselected: a hairline in the border token; selected: a primary ring clear of the tile.
const RING =
  'outline-none shadow-[inset_0_0_0_1px_var(--color-border)] transition-shadow focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-pressed:ring-2 aria-pressed:ring-primary-600 aria-pressed:ring-offset-2 aria-pressed:ring-offset-background';

/** Farbkreis: 32 px im Inspektor, auf dem Handy so breit wie seine Rasterspalte. */
const SWATCH_CLASS = `aspect-square w-full shrink-0 cursor-pointer rounded-full md:size-8 ${RING}`;
/** Kachel im Fünferraster des Inspektors (Vorlagen, Deine). */
export const TILE_CLASS = `relative aspect-square w-full min-w-0 cursor-pointer overflow-hidden rounded-[10px] ${RING}`;
/** Kachel fester Größe für den Entdecken-Dialog. */
const DIALOG_TILE_CLASS = `relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-[10px] ${RING}`;

export const CUSTOM_ID = 'eigenes-bild';

/** Leere Kachel für Aktionen im Raster — Entdecken. */
export const ACTION_TILE_CLASS =
  'flex aspect-square w-full min-w-0 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-border text-muted-foreground outline-none transition-colors hover:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/** Zwischenüberschrift einer Auswahlgruppe im Inspektor. */
export const SECTION_LABEL_CLASS =
  'm-0 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground';

const TILE_GRID = 'grid grid-cols-5 gap-2.5 p-0.5';

export interface ProfilbildBackgroundPickerProps {
  colors: Swatch[];
  /** Die Verläufe des Landes-CD. */
  gradients: Swatch[];
  freeBackground: FreeBackground | null;
  onSelectFree: (bg: FreeBackground) => void;
  presets: PresetDesign[];
  selected: string;
  customImageSrc: string | null;
  /** The stored share path of the custom background, if it has one yet. */
  customUrl: string | null;
  onSelect: (id: string) => void;
  onSelectPreset: (design: PresetDesign) => void;
  onSelectGallery: (item: GalleryAsset) => void;
  onUpload: () => void;
  /** While an own background is being uploaded. */
  uploading: boolean;
}

export function ProfilbildBackgroundPicker({
  colors,
  gradients,
  freeBackground,
  onSelectFree,
  presets,
  selected,
  customImageSrc,
  customUrl,
  onSelect,
  onSelectPreset,
  onSelectGallery,
  onUpload,
  uploading,
}: ProfilbildBackgroundPickerProps) {
  // Die CD-Farben des Landes als Schnellwahl im freien Farbwähler.
  const palette = colors.flatMap((s) =>
    s.background.kind === 'color' ? [{ hex: s.background.color, label: s.label }] : []
  );
  const freeSelected = selected === FREE_BACKGROUND_ID ? freeBackground : null;

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
    <div className="flex flex-col gap-3.5">
      <section aria-label="Vorlagen" className="flex flex-col gap-2.5">
        <h3 className={SECTION_LABEL_CLASS}>Vorlagen</h3>
        <div className={TILE_GRID}>
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
        </div>
      </section>

      <section aria-label="Farben" className="flex flex-col gap-2.5">
        <h3 className={SECTION_LABEL_CLASS}>Farben</h3>
        {/* Vollfarben und Verläufe laufen als eine Reihe durch; die Gruppen bleiben für Screenreader. */}
        <div className="grid grid-cols-8 gap-1.5 p-0.5 md:flex md:flex-wrap md:gap-2.5">
          <div role="group" aria-label="Vollfarben" className="contents">
            {colors.map(renderSwatch)}
          </div>
          <div role="group" aria-label="Verläufe" className="contents">
            {gradients.map(renderSwatch)}
          </div>
          <ProfilbildFreeColor
            value={freeBackground}
            pressed={freeSelected !== null}
            palette={palette}
            tileClassName={SWATCH_CLASS}
            onChange={onSelectFree}
          />
        </div>
      </section>

      {/* Eigenes Foto, selbst erstellte und gemerkte Hintergründe im Raster, Entdecken
          als Kachel dahinter; darunter der Upload über die volle Breite. */}
      <section aria-label="Deine" className="flex flex-col gap-2.5">
        <h3 className={SECTION_LABEL_CLASS}>Deine</h3>
        <ProfilbildGalleryGrid
          kind="background"
          source="own"
          gridClassName={TILE_GRID}
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
            <ProfilbildDiscoverButton
              kind="background"
              buttonClassName={ACTION_TILE_CLASS}
              tileClassName={DIALOG_TILE_CLASS}
              onPick={onSelectGallery}
            />
          }
        />
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading}
          className="h-12 w-full cursor-pointer rounded-[10px] border-[1.5px] border-dashed border-border bg-transparent text-sm text-muted-foreground outline-none transition-colors hover:border-primary-500 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 md:h-14"
        >
          {uploading ? 'Wird hochgeladen …' : '+ Eigenen Hintergrund hochladen'}
        </button>
      </section>
    </div>
  );
}
