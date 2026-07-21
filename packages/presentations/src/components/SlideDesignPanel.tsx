import {
  PRESENTATION_ACCENT_OPTIONS,
  PRESENTATION_DEFAULT_ACCENT,
  type Slide,
  type SlideLayout,
  type SlideTransition,
} from '@gruenerator/contracts';
import { type ReactNode, useState } from 'react';
import { FiChevronDown, FiImage, FiX } from 'react-icons/fi';

import { type DeckOptions } from '../collab/useSlides.js';

import {
  BACKGROUND_SWATCHES,
  LAYOUTS,
  LAYOUT_LABELS,
  TRANSITIONS,
  TRANSITION_LABELS,
  VARIANT_NAMES,
} from './labels.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { VariantThumb } from './VariantThumb.js';

export interface SlideDesignPanelProps {
  slide: Slide;
  onUpdateSlide: (patch: Partial<Slide>) => void;
  deckOptions: DeckOptions;
  onDeckOption: (patch: Partial<DeckOptions>) => void;
  onClose: () => void;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-[0.06em] text-[#6E7E74] dark:text-grey-400">
      {children}
    </div>
  );
}

/** A collapsible "Übergänge…" / "Präsentations-Einstellungen" section. */
function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 border-none bg-transparent p-0 text-left text-[13px] font-bold text-[#2F4238] dark:text-grey-200"
      >
        <span className="flex-1">{title}</span>
        <FiChevronDown
          size={14}
          className={`text-[#6E7E74] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="flex flex-col gap-3.5">{children}</div>}
    </div>
  );
}

function segClass(active: boolean): string {
  return active
    ? 'h-[34px] rounded-lg border-[1.5px] border-primary-600 bg-[#EAF2EE] dark:bg-primary-900/30 px-3 text-[13px] font-bold text-[#2F4238] dark:text-primary-200'
    : 'h-[34px] rounded-lg border-[1.5px] border-[#D4DDD7] dark:border-grey-600 bg-white dark:bg-grey-800 px-3 text-[13px] font-bold text-[#4A5A51] dark:text-grey-300 hover:border-primary-500';
}

/**
 * The "Gestalten" panel: all per-slide and deck options in a collapsible right
 * rail. Replaces the old always-visible option bar. Matches the design kit.
 */
export function SlideDesignPanel({
  slide,
  onUpdateSlide,
  deckOptions,
  onDeckOption,
  onClose,
}: SlideDesignPanelProps) {
  const accent = deckOptions.accentColor?.trim() || PRESENTATION_DEFAULT_ACCENT;
  return (
    <div className="flex w-[300px] flex-none flex-col overflow-y-auto border-l border-[#E2E8E4] dark:border-grey-700 bg-white dark:bg-grey-900">
      <div className="flex items-center gap-2 px-[18px] pb-3 pt-4">
        <div className="flex-1 font-[Raleway] text-[15px] font-bold text-[#1B2A22] dark:text-grey-100">
          Folie gestalten
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Panel schließen"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border-none bg-transparent text-[#6E7E74] hover:bg-[#EFF3F0] dark:hover:bg-grey-800"
        >
          <FiX size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-[18px] px-[18px] pb-[18px] pt-1">
        {/* Layout */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Layout</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {LAYOUTS.map((layout) => (
              <button
                key={layout}
                type="button"
                // Reset variant/background: the variant index is layout-specific
                // and the default background changes with the layout.
                onClick={() => onUpdateSlide({ layout, variant: 0, background: null })}
                className={segClass(slide.layout === layout)}
              >
                {LAYOUT_LABELS[layout]}
              </button>
            ))}
          </div>
        </div>

        {/* Variant */}
        {(VARIANT_NAMES[slide.layout]?.length ?? 0) > 1 && (
          <div className="flex flex-col gap-2">
            <SectionLabel>Variante</SectionLabel>
            <div className="flex gap-2">
              {VARIANT_NAMES[slide.layout]!.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onUpdateSlide({ variant: i, background: null })}
                  className={`flex flex-1 flex-col gap-1.5 rounded-[10px] p-2 text-left text-[11.5px] font-bold text-[#2F4238] dark:text-grey-200 ${
                    (slide.variant ?? 0) === i
                      ? 'border-2 border-primary-600'
                      : 'border-[1.5px] border-[#D4DDD7] dark:border-grey-600 hover:border-primary-500'
                  }`}
                >
                  <VariantThumb layout={slide.layout} variant={i} accent={accent} />
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Background */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Hintergrund</SectionLabel>
          <div className="flex flex-wrap items-center gap-2.5">
            {BACKGROUND_SWATCHES.map((sw) => (
              <button
                key={sw.value}
                type="button"
                title={sw.name}
                onClick={() => onUpdateSlide({ background: sw.value })}
                style={{ background: sw.value }}
                className={`h-[38px] w-[38px] rounded-full ${
                  slide.background === sw.value
                    ? 'border-[3px] border-[#1B2A22]'
                    : 'border-[1.5px] border-[#D4DDD7]'
                }`}
              />
            ))}
            <button
              type="button"
              title="Hintergrund entfernen"
              onClick={() => onUpdateSlide({ background: null })}
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[#B9C7BE] text-[#6E7E74] hover:border-primary-500 hover:text-primary-600"
            >
              <FiImage size={15} />
            </button>
          </div>
          <input
            value={slide.background ?? ''}
            placeholder="Farbe (#…) oder Bild-URL"
            onChange={(e) => onUpdateSlide({ background: e.target.value || null })}
            className="h-[34px] rounded-lg border border-[#D4DDD7] dark:border-grey-600 bg-white dark:bg-grey-800 px-2.5 text-sm text-[#1B2A22] dark:text-grey-100"
          />
        </div>

        <div className="h-px bg-[#EFF3F0] dark:bg-grey-700" />

        {/* Transitions & animation */}
        <Collapsible title="Übergänge & Animation">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-[#6E7E74] dark:text-grey-400">
              Übergang zur nächsten Folie
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateSlide({ transition: null })}
                className={segClass(!slide.transition)}
              >
                Standard
              </button>
              {TRANSITIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onUpdateSlide({ transition: t as SlideTransition })}
                  className={segClass(slide.transition === t)}
                >
                  {TRANSITION_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {slide.layout === 'code' && (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-[#6E7E74] dark:text-grey-400">Code-Sprache</div>
              <input
                value={slide.codeLanguage ?? ''}
                placeholder="z.B. typescript"
                onChange={(e) => onUpdateSlide({ codeLanguage: e.target.value || null })}
                className="h-[34px] rounded-lg border border-[#D4DDD7] dark:border-grey-600 bg-white dark:bg-grey-800 px-2.5 text-sm"
              />
            </div>
          )}

          <ToggleSwitch
            checked={slide.fragments ?? false}
            onChange={(v) => onUpdateSlide({ fragments: v })}
            label="Schrittweise aufbauen"
            hint="Punkte einzeln einblenden"
          />
          <ToggleSwitch
            checked={slide.autoAnimate ?? false}
            onChange={(v) => onUpdateSlide({ autoAnimate: v })}
            label="Auto-Animate"
            hint="Weiche Übergänge zwischen Folien"
          />
          <ToggleSwitch
            checked={slide.hidden ?? false}
            onChange={(v) => onUpdateSlide({ hidden: v })}
            label="Folie ausblenden"
            hint="Beim Präsentieren überspringen"
          />
        </Collapsible>

        <div className="h-px bg-[#EFF3F0] dark:bg-grey-700" />

        {/* Presentation settings (deck-wide) */}
        <Collapsible title="Präsentations-Einstellungen">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-[#6E7E74] dark:text-grey-400">Marke (Akzentfarbe)</div>
            <div className="flex items-center gap-2.5">
              {PRESENTATION_ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.name}
                  onClick={() => onDeckOption({ accentColor: opt.value })}
                  style={{ background: opt.value }}
                  className={`h-[34px] w-[34px] rounded-full ${
                    accent.toLowerCase() === opt.value.toLowerCase()
                      ? 'border-[3px] border-[#1B2A22]'
                      : 'border-[1.5px] border-[#D4DDD7]'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-[#6E7E74] dark:text-grey-400">Standard-Übergang</div>
            <select
              value={deckOptions.defaultTransition ?? 'slide'}
              onChange={(e) =>
                onDeckOption({ defaultTransition: e.target.value as SlideTransition })
              }
              className="h-[34px] rounded-lg border border-[#D4DDD7] dark:border-grey-600 bg-white dark:bg-grey-800 px-2.5 text-sm"
            >
              {TRANSITIONS.map((t) => (
                <option key={t} value={t}>
                  {TRANSITION_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <ToggleSwitch
            checked={deckOptions.slideNumber}
            onChange={(v) => onDeckOption({ slideNumber: v })}
            label="Foliennummern"
            hint="Nummer auf jeder Folie zeigen"
          />
          <ToggleSwitch
            checked={deckOptions.loop}
            onChange={(v) => onDeckOption({ loop: v })}
            label="Endlosschleife"
            hint="Nach der letzten Folie von vorn"
          />
          <div className="flex items-center gap-2.5">
            <div className="flex flex-1 flex-col gap-px">
              <div className="text-[13.5px] font-bold text-[#1B2A22] dark:text-grey-100">
                Automatisch weiter
              </div>
              <div className="text-xs text-[#6E7E74] dark:text-grey-400">
                Sekunden pro Folie (0 = aus)
              </div>
            </div>
            <input
              type="number"
              min={0}
              max={120}
              value={deckOptions.autoSlide ? Math.round(deckOptions.autoSlide / 1000) : 0}
              onChange={(e) => {
                const secs = Number(e.target.value);
                onDeckOption({ autoSlide: secs > 0 ? secs * 1000 : null });
              }}
              className="h-[34px] w-[60px] rounded-lg border border-[#D4DDD7] dark:border-grey-600 bg-white dark:bg-grey-800 px-2.5 text-sm"
            />
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
