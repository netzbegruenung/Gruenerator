import { MasterCanvasEditor, type CanvasEditorExportApi } from '@gruenerator/canvas-editor';
import { type StudioAssetItem } from '@gruenerator/contracts';
import {
  STICKER_OUTLINE,
  STICKER_SHADOW,
  stickerSwatches,
  swatchColor,
} from '@gruenerator/shared/stickers';
import { Button, toast } from '@gruenerator/ui';
import { useEffect, useRef, useState, type JSX } from 'react';
import { PiArrowLeft } from 'react-icons/pi';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { WebCanvasEditorProvider } from '../../image-studio/WebCanvasEditorProvider';
import { profilbildAssetHref } from '../../studio-tools/utils/galleryAsset';
import { ExportCanvasVorlageButton } from '../../vorlagen/components/ExportCanvasVorlageButton';

import { SwatchPicker, SwitchRow, type StickerDraft } from './creatorParts';
import {
  canvasToPngBlob,
  imageToCanvas,
  loadImage,
  renderSticker,
  StickerImageError,
  trimTransparent,
} from './stickerEffects';
import { StickerSaveDialog } from './StickerSaveDialog';

const GALLERY_PATH = '/studio/sticker';
const EMPTY_ERROR = 'Auf der Fläche ist noch nichts – füge Text, ein Element oder ein Bild hinzu.';

/**
 * The full canvas editor on a transparent square. "Als Sticker speichern"
 * renders the page without background, trims it to the motif, adds the
 * die-cut outline and saves it like the quick creator does.
 */
const StickerCanvasPage = (): JSX.Element => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('return');
  const locale = useAuthStore((s) => s.locale);
  const outlineSwatches = stickerSwatches(locale);
  const exportApi = useRef<CanvasEditorExportApi>(null);

  const [motif, setMotif] = useState<HTMLCanvasElement | null>(null);
  const [outlineOn, setOutlineOn] = useState(true);
  const [outlineColor, setOutlineColor] = useState(() => swatchColor(outlineSwatches, 'weiss'));
  const [shadowOn, setShadowOn] = useState(false);
  const [draft, setDraft] = useState<StickerDraft | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const leave = () =>
    void navigate(returnTo === 'profilbild' ? '/studio/profilbild' : GALLERY_PATH);

  const openSave = async () => {
    setCapturing(true);
    try {
      // Twice the sheet, so a small motif still trims to a sharp sticker.
      const dataUrl = await exportApi.current?.captureActivePage({
        pixelRatio: 2,
        transparent: true,
      });
      if (!dataUrl) throw new StickerImageError('Der Sticker konnte nicht erstellt werden.');
      setMotif(trimTransparent(imageToCanvas(await loadImage(dataUrl))));
      setSaveOpen(true);
    } catch (err) {
      toast.error(err instanceof StickerImageError ? err.message : EMPTY_ERROR);
    } finally {
      setCapturing(false);
    }
  };

  // The outline goes round the whole composition, so it is applied here, not in the editor.
  useEffect(() => {
    if (!motif) return;
    let cancelled = false;
    void canvasToPngBlob(
      renderSticker(motif, {
        outline: outlineOn ? { width: STICKER_OUTLINE.initial, color: outlineColor } : null,
        shadow: shadowOn ? STICKER_SHADOW : null,
      })
    ).then((blob) => {
      if (!cancelled) setDraft({ blob, suggestedTitle: 'Mein Sticker', source: 'badge' });
    });
    return () => {
      cancelled = true;
    };
  }, [motif, outlineOn, outlineColor, shadowOn]);

  const saved = (item: StudioAssetItem) =>
    void navigate(returnTo === 'profilbild' ? profilbildAssetHref(item) : GALLERY_PATH);

  return (
    <WebCanvasEditorProvider allowStickerCreator={false}>
      <div className="relative flex h-dvh flex-col bg-[var(--editor-bg)]">
        <MasterCanvasEditor
          type="sticker"
          formatId="profile-square"
          documentTitle="Sticker"
          initialState={{}}
          onExport={() => {}}
          onCancel={leave}
          galleryAutoSave={false}
          showShare={false}
          exportApiRef={exportApi}
          chromeLeft={
            <button
              type="button"
              onClick={leave}
              aria-label="Zurück"
              title="Zurück"
              className="flex size-[34px] cursor-pointer items-center justify-center rounded-[10px] border-none bg-transparent text-white/90 transition-[background-color,color] duration-200 hover:bg-white/15 hover:text-white max-canvas-mobile:size-8"
            >
              <PiArrowLeft size={20} />
            </button>
          }
          chromeCenter={<span className="text-sm font-semibold text-white">Sticker gestalten</span>}
          chromeRight={
            <div className="flex items-center gap-2">
              <ExportCanvasVorlageButton
                exportApi={exportApi}
                formatId="profile-square"
                transparent
              />
              <Button
                type="button"
                size="sm"
                variant="brand"
                disabled={capturing}
                onClick={() => void openSave()}
              >
                {capturing ? 'Wird vorbereitet …' : 'Als Sticker speichern'}
              </Button>
            </div>
          }
        />
      </div>
      <StickerSaveDialog draft={draft} open={saveOpen} onOpenChange={setSaveOpen} onSaved={saved}>
        <div className="flex flex-col gap-md rounded-lg bg-background-alt p-sm">
          <SwitchRow label="Kontur" checked={outlineOn} onChange={setOutlineOn}>
            <SwatchPicker
              label="Farbe der Kontur"
              swatches={outlineSwatches}
              value={outlineColor}
              onChange={setOutlineColor}
            />
          </SwitchRow>
          <SwitchRow label="Schatten" checked={shadowOn} onChange={setShadowOn} />
        </div>
      </StickerSaveDialog>
    </WebCanvasEditorProvider>
  );
};

export default StickerCanvasPage;
