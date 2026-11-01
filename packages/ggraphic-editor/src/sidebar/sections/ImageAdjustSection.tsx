// SPDX-License-Identifier: MPL-2.0
import { useDocumentBrand } from '@ggraphic/editor/brand/documentBrand';
import { CustomColorSwatch } from '@ggraphic/editor/components/CustomColorSwatch';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { SidebarSlider } from '@ggraphic/editor/sidebar/components/SidebarSlider';
import { Switch } from '@ggraphic/editor/ui/switch';
import { colorName } from '@ggraphic/editor/utils/colorNames';
import { defaultTint, EMPTY_ADJUSTMENTS, IMAGE_PRESETS } from '@ggraphic/editor/utils/imageFilters';
import {
  CROP_PRESETS,
  cropPresetUpdate,
  type CropPreset,
  type ImageAdjustments,
  type UserImageInstance,
} from '@ggraphic/editor/utils/userImageUtils';

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
  /** The template's background photo, when it is the selection: the look only, no crop or shadow. */
  backgroundPhoto?: {
    adjustments: ImageAdjustments;
    onUpdate: (partial: Partial<ImageAdjustments>) => void;
  } | null;
}

const GROUP_LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-foreground-muted';

export function ImageAdjustSection({
  selectedImage,
  onUpdateImage,
  backgroundPhoto = null,
}: ImageAdjustSectionProps) {
  const { tints, shadows } = useDocumentBrand().effects;
  const t = useMessages();
  const img = selectedImage;
  const adj: ImageAdjustments | null = img ?? backgroundPhoto?.adjustments ?? null;
  if (!adj) return null;
  const set = (partial: Partial<ImageAdjustments>) =>
    img ? onUpdateImage(img.id, partial) : backgroundPhoto?.onUpdate(partial);
  const setShadow = (partial: Partial<UserImageInstance>) => img && onUpdateImage(img.id, partial);
  const shadowOn = !!img?.shadowColor;
  const applyCrop = (preset: CropPreset) => {
    if (!img) return;
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
          {t.sidebar.imageAdjust.reset}
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
      {img && (
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
      )}

      {/* Flip */}
      <div className="flex flex-col gap-1.5">
        <span className={GROUP_LABEL}>Spiegeln</span>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ['flipX', t.sidebar.imageAdjust.horizontal],
              ['flipY', t.sidebar.imageAdjust.vertical],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={!!adj[key]}
              onClick={() => set({ [key]: !adj[key] })}
              className="rounded-md border border-editor-border-strong px-2 py-1.5 text-xs text-foreground-muted transition-colors hover:border-primary-500 hover:text-foreground aria-pressed:border-primary-500 aria-pressed:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tint */}
      <div className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>{t.sidebar.imageAdjust.tint}</span>
        <div className="flex items-center gap-1.5">
          {tints.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set({ tint: c, tintStrength: adj.tintStrength || 1 })}
              title={colorName(c)}
              aria-label={t.sidebar.imageAdjust.tintIn(colorName(c))}
              aria-pressed={(adj.tint ?? defaultTint()) === c && !!adj.tintStrength}
              className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                outline:
                  (adj.tint ?? defaultTint()) === c && adj.tintStrength
                    ? '2px solid var(--editor-accent)'
                    : 'none',
                outlineOffset: '2px',
              }}
            />
          ))}
          <CustomColorSwatch
            value={adj.tintStrength ? adj.tint : null}
            presets={tints}
            onPick={(color) => set({ tint: color, tintStrength: adj.tintStrength || 1 })}
            className="size-6"
          />
        </div>
        <SidebarSlider
          label={t.sidebar.imageAdjust.intensity}
          value={adj.tintStrength ?? 0}
          onValueChange={(v) => set({ tintStrength: v })}
          min={0}
          max={1}
          step={0.05}
          unit="%"
        />
      </div>

      {/* White balance */}
      <div className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>{t.sidebar.imageAdjust.whiteBalance}</span>
        <SidebarSlider
          label={t.sidebar.imageAdjust.colorTemperature}
          value={adj.temperature ?? 0}
          onValueChange={(v) => set({ temperature: v })}
          min={-100}
          max={100}
          step={1}
        />
        <SidebarSlider
          label={t.sidebar.imageAdjust.hue}
          value={adj.hue ?? 0}
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
          label={t.sidebar.imageAdjust.brightness}
          value={adj.brightness ?? 0}
          onValueChange={(v) => set({ brightness: v })}
          min={-1}
          max={1}
          step={0.05}
        />
        <SidebarSlider
          label={t.sidebar.imageAdjust.contrast}
          value={adj.contrast ?? 0}
          onValueChange={(v) => set({ contrast: v })}
          min={-100}
          max={100}
          step={1}
        />
      </div>

      {/* Color / blur */}
      <div className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>{t.sidebar.imageAdjust.colorAndSharpness}</span>
        <SidebarSlider
          label={t.sidebar.imageAdjust.saturation}
          value={adj.saturation ?? 0}
          onValueChange={(v) => set({ saturation: v })}
          min={-2}
          max={10}
          step={0.1}
        />
        <SidebarSlider
          label={t.sidebar.imageAdjust.blur}
          value={adj.blur ?? 0}
          onValueChange={(v) => set({ blur: v })}
          min={0}
          max={40}
          step={1}
        />
        <SidebarSlider
          label={t.sidebar.imageAdjust.vignette}
          value={adj.vignette ?? 0}
          onValueChange={(v) => set({ vignette: v })}
          min={0}
          max={1}
          step={0.05}
          unit="%"
        />
      </div>

      {/* Shadow */}
      {img && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className={GROUP_LABEL}>Schatten</span>
            <button
              type="button"
              onClick={toggleShadow}
              className="text-[11px] font-medium text-primary-600 hover:underline"
            >
              {shadowOn ? t.sidebar.imageAdjust.remove : t.sidebar.imageAdjust.enable}
            </button>
          </div>
          {shadowOn && (
            <>
              <div className="flex items-center gap-1.5">
                {shadows.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setShadow({ shadowColor: c })}
                    title={colorName(c)}
                    aria-label={colorName(c)}
                    aria-pressed={img.shadowColor === c}
                    className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      outline: img.shadowColor === c ? '2px solid var(--editor-accent)' : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
                <CustomColorSwatch
                  value={img.shadowColor}
                  presets={shadows}
                  onPick={(color) => setShadow({ shadowColor: color })}
                  className="size-6"
                />
              </div>
              <SidebarSlider
                label={t.sidebar.imageAdjust.softness}
                value={img.shadowBlur ?? 0}
                onValueChange={(v) => setShadow({ shadowBlur: v })}
                min={0}
                max={40}
                step={1}
              />
              <SidebarSlider
                label={t.sidebar.imageAdjust.offsetX}
                value={img.shadowOffsetX ?? 0}
                onValueChange={(v) => setShadow({ shadowOffsetX: v })}
                min={-40}
                max={40}
                step={1}
              />
              <SidebarSlider
                label={t.sidebar.imageAdjust.offsetY}
                value={img.shadowOffsetY ?? 0}
                onValueChange={(v) => setShadow({ shadowOffsetY: v })}
                min={-40}
                max={40}
                step={1}
              />
              <SidebarSlider
                label={t.sidebar.imageAdjust.opacity}
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
      )}

      {/* Effect toggles */}
      <div className="flex flex-col gap-2">
        {(
          [
            ['grayscale', t.sidebar.imageAdjust.grayscale],
            ['sepia', t.sidebar.imageAdjust.sepia],
            ['invert', t.sidebar.imageAdjust.invert],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-xs text-foreground">{label}</span>
            <Switch checked={!!adj[key]} onCheckedChange={(v) => set({ [key]: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}
