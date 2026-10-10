import { Switch } from '@gruenerator/ui';

import { CustomColorSwatch } from '../../components/CustomColorSwatch';
import { DEFAULT_TINT, EMPTY_ADJUSTMENTS, IMAGE_PRESETS } from '../../utils/imageFilters';
import {
  CROP_PRESETS,
  cropPresetUpdate,
  type CropPreset,
  type ImageAdjustments,
  type UserImageInstance,
} from '../../utils/userImageUtils';
import { SidebarSlider } from '../components/SidebarSlider';

/** DE Tanne and Klee, AT Dunkel- and Hellgrün. */
const TINTS = ['#005538', '#008939', '#257639', '#56AF31'];
/** Schattenfarben des Bildes, wie in der Kontextleiste. */
const SHADOW_COLORS = ['#000000', '#316049', '#40200e', '#1f3a5f'];

function naturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}

export interface ImageAdjustSectionProps {
  selectedImage: UserImageInstance | null;
  onUpdateImage: (id: string, partial: Partial<UserImageInstance>) => void;
}

const GROUP_LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-foreground-muted';

export function ImageAdjustSection({ selectedImage, onUpdateImage }: ImageAdjustSectionProps) {
  const img = selectedImage;
  if (!img) return null;
  const set = (partial: Partial<ImageAdjustments>) => onUpdateImage(img.id, partial);
  const setShadow = (partial: Partial<UserImageInstance>) => onUpdateImage(img.id, partial);
  const shadowOn = !!img.shadowColor;
  const applyCrop = (preset: CropPreset) => {
    void naturalSize(img.src)
      .then((natural) => onUpdateImage(img.id, cropPresetUpdate(img, preset, natural)))
      .catch(() => {});
  };
  const toggleShadow = () =>
    shadowOn
      ? setShadow({ shadowColor: undefined, shadowBlur: 0, shadowOpacity: 0 })
      : setShadow({
          shadowColor: '#000000',
          shadowBlur: 8,
          shadowOffsetX: 4,
          shadowOffsetY: 4,
          shadowOpacity: 0.5,
        });

  return (
    <div className="flex flex-col gap-4 p-md w-full min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Anpassen</span>
        <button
          type="button"
          onClick={() => set(EMPTY_ADJUSTMENTS)}
          className="rounded-md px-2 py-1 text-xs text-foreground-muted hover:text-foreground"
        >
          Zurücksetzen
        </button>
      </div>

      {/* Presets */}
      <div className="flex flex-col gap-1.5">
        <span className={GROUP_LABEL}>Presets</span>
        <div className="grid grid-cols-3 gap-1.5">
          {IMAGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => set(preset.values)}
              className="rounded-md border border-editor-border-strong px-2 py-1.5 text-xs text-foreground-muted transition-colors hover:border-primary-500 hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Crop */}
      <div className="flex flex-col gap-1.5">
        <span className={GROUP_LABEL}>Ausschnitt</span>
        <div className="grid grid-cols-4 gap-1.5">
          {CROP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyCrop(preset)}
              className="rounded-md border border-editor-border-strong px-2 py-1.5 text-xs text-foreground-muted transition-colors hover:border-primary-500 hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tint */}
      <div className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Einfärben</span>
        <div className="flex items-center gap-1.5">
          {TINTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set({ tint: c, tintStrength: img.tintStrength || 1 })}
              title={c}
              aria-label={`Einfärben in ${c}`}
              aria-pressed={(img.tint ?? DEFAULT_TINT) === c && !!img.tintStrength}
              className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                outline:
                  (img.tint ?? DEFAULT_TINT) === c && img.tintStrength
                    ? '2px solid var(--editor-accent, #005538)'
                    : 'none',
                outlineOffset: '2px',
              }}
            />
          ))}
          <CustomColorSwatch
            value={img.tintStrength ? img.tint : null}
            presets={TINTS}
            onPick={(color) => set({ tint: color, tintStrength: img.tintStrength || 1 })}
            className="size-6"
          />
        </div>
        <SidebarSlider
          label="Stärke"
          value={img.tintStrength ?? 0}
          onValueChange={(v) => set({ tintStrength: v })}
          min={0}
          max={1}
          step={0.05}
          unit="%"
        />
      </div>

      {/* White balance */}
      <div className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Weißabgleich</span>
        <SidebarSlider
          label="Farbtemperatur"
          value={img.temperature ?? 0}
          onValueChange={(v) => set({ temperature: v })}
          min={-100}
          max={100}
          step={1}
        />
        <SidebarSlider
          label="Farbton"
          value={img.hue ?? 0}
          onValueChange={(v) => set({ hue: v })}
          min={0}
          max={360}
          step={1}
        />
      </div>

      {/* Light */}
      <div className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Hell</span>
        <SidebarSlider
          label="Helligkeit"
          value={img.brightness ?? 0}
          onValueChange={(v) => set({ brightness: v })}
          min={-1}
          max={1}
          step={0.05}
        />
        <SidebarSlider
          label="Kontrast"
          value={img.contrast ?? 0}
          onValueChange={(v) => set({ contrast: v })}
          min={-100}
          max={100}
          step={1}
        />
      </div>

      {/* Color / blur */}
      <div className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Farbe & Schärfe</span>
        <SidebarSlider
          label="Sättigung"
          value={img.saturation ?? 0}
          onValueChange={(v) => set({ saturation: v })}
          min={-2}
          max={10}
          step={0.1}
        />
        <SidebarSlider
          label="Weichzeichnen"
          value={img.blur ?? 0}
          onValueChange={(v) => set({ blur: v })}
          min={0}
          max={40}
          step={1}
        />
      </div>

      {/* Shadow */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={GROUP_LABEL}>Schatten</span>
          <button
            type="button"
            onClick={toggleShadow}
            className="text-[11px] font-medium text-primary-600 hover:underline"
          >
            {shadowOn ? 'Entfernen' : 'Aktivieren'}
          </button>
        </div>
        {shadowOn && (
          <>
            <div className="flex items-center gap-1.5">
              {SHADOW_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setShadow({ shadowColor: c })}
                  title={c}
                  className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline:
                      img.shadowColor === c ? '2px solid var(--editor-accent, #005538)' : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
              <CustomColorSwatch
                value={img.shadowColor}
                presets={SHADOW_COLORS}
                onPick={(color) => setShadow({ shadowColor: color })}
                className="size-6"
              />
            </div>
            <SidebarSlider
              label="Weichheit"
              value={img.shadowBlur ?? 0}
              onValueChange={(v) => setShadow({ shadowBlur: v })}
              min={0}
              max={40}
              step={1}
            />
            <SidebarSlider
              label="X-Versatz"
              value={img.shadowOffsetX ?? 0}
              onValueChange={(v) => setShadow({ shadowOffsetX: v })}
              min={-40}
              max={40}
              step={1}
            />
            <SidebarSlider
              label="Y-Versatz"
              value={img.shadowOffsetY ?? 0}
              onValueChange={(v) => setShadow({ shadowOffsetY: v })}
              min={-40}
              max={40}
              step={1}
            />
            <SidebarSlider
              label="Deckkraft"
              value={img.shadowOpacity ?? 0}
              onValueChange={(v) => setShadow({ shadowOpacity: v })}
              min={0}
              max={1}
              step={0.05}
              unit="%"
            />
          </>
        )}
      </div>

      {/* Effect toggles */}
      <div className="flex flex-col gap-2">
        {(
          [
            ['grayscale', 'Graustufen'],
            ['sepia', 'Sepia'],
            ['invert', 'Invertieren'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-xs text-foreground">{label}</span>
            <Switch checked={!!img[key]} onCheckedChange={(v) => set({ [key]: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}
