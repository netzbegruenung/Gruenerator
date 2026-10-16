import { type StudioAssetItem } from '@gruenerator/contracts';
import {
  assetFormBody,
  emptyAssetForm,
  isAssetFormComplete,
  TITLE_MAX,
  useStudioAssetMutations,
  type StudioAssetFormValues,
} from '@gruenerator/shared/studio-assets';
import { slugifyName } from '@gruenerator/shared/utils';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  toast,
  ToggleGroup,
  ToggleGroupItem,
} from '@gruenerator/ui';
import { useCallback, useRef, useState, type FormEvent, type JSX, type ReactNode } from 'react';
import { PiCheckCircle, PiImageSquare, PiTextAa } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { uploadBlobToMediaShare } from '../../image-studio/services/mediaUploadService';
import { CHECKERBOARD } from '../../studio-tools/components/ToolResultCard';
import { profilbildAssetHref } from '../../studio-tools/utils/galleryAsset';
import { StudioAssetFormFields } from '../StudioAssetFormFields';

import { BadgeDesigner } from './BadgeDesigner';
import { useObjectUrl, type DesignerParts, type StickerDraft } from './creatorParts';
import { ImageStickerDesigner } from './ImageStickerDesigner';

import { cn } from '@/utils/cn';

const GALLERY_PATH = '/studio/sticker';
const UPLOAD_ERROR = 'Das Hochladen hat nicht geklappt. Bitte versuche es erneut.';

export type StickerCreatorReturn = 'profilbild' | 'canvas' | null;

/** Upload and cut-out share one way in: the creator decides by the picture. */
type CreatorKind = 'image' | 'badge';

const KINDS: { value: CreatorKind; label: string; icon: typeof PiImageSquare }[] = [
  { value: 'image', label: 'Bild', icon: PiImageSquare },
  { value: 'badge', label: 'Text-Badge', icon: PiTextAa },
];

export interface StickerCreatorProps {
  /** The visible title, e.g. the page's h1 or the dialog's title. */
  heading: ReactNode;
  description?: string;
  /** Extra header controls after the save button, e.g. the dialog's close button. */
  headerEnd?: ReactNode;
  className?: string;
  /** Where the person came from; shapes the closing step. */
  returnTo?: StickerCreatorReturn;
  /** Takes the new sticker instead of the closing step — e.g. straight onto a Profilbild. */
  onCreated?: (item: StudioAssetItem) => void;
}

/**
 * Stage in the middle, everything else in the side panel — the Profilbild
 * editor's layout. Fills its parent; the page gives it the viewport, the dialog its box.
 */
export function StickerCreator({
  heading,
  description,
  headerEnd,
  className,
  returnTo = null,
  onCreated,
}: StickerCreatorProps): JSX.Element {
  const locale = useAuthStore((s) => s.locale);
  const { create } = useStudioAssetMutations();

  const [kind, setKind] = useState<CreatorKind>('image');
  const [session, setSession] = useState(0);
  const [draft, setDraft] = useState<StickerDraft | null>(null);
  const [created, setCreated] = useState<StudioAssetItem | null>(null);
  const [form, setForm] = useState<StudioAssetFormValues>(() => emptyAssetForm(locale));
  // Until the title is typed into, it follows the design (file name or badge text).
  const titleTouched = useRef(false);
  const uploaded = useRef<{ blob: Blob; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftUrl = useObjectUrl(draft?.blob ?? null);

  const takeDraft = useCallback((next: StickerDraft | null) => {
    setDraft(next);
    if (next && !titleTouched.current)
      setForm((f) => ({ ...f, title: next.suggestedTitle.slice(0, TITLE_MAX) }));
  }, []);

  const changeForm = (next: StudioAssetFormValues) => {
    if (next.title !== form.title) titleTouched.current = true;
    setForm(next);
  };

  const switchKind = (next: CreatorKind) => {
    setKind(next);
    setDraft(null);
    setError(null);
  };

  const startOver = () => {
    setSession((n) => n + 1);
    setDraft(null);
    setCreated(null);
    setForm(emptyAssetForm(locale));
    titleTouched.current = false;
    setError(null);
  };

  const canSave = !!draft && isAssetFormComplete(form) && !busy;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !canSave) return;
    setBusy(true);
    setError(null);
    // A retry after a failed create reuses the upload instead of orphaning another file.
    const shareToken =
      uploaded.current?.blob === draft.blob
        ? uploaded.current.token
        : await uploadBlobToMediaShare(draft.blob, {
            filename: `${slugifyName(form.title, 'sticker')}.png`,
            uploadSource: 'studio-asset',
          }).catch(() => null);
    if (!shareToken) {
      setError(UPLOAD_ERROR);
      setBusy(false);
      return;
    }
    uploaded.current = { blob: draft.blob, token: shareToken };
    try {
      const item = await create.mutateAsync({
        shareToken,
        kind: 'sticker',
        source: draft.source,
        ...assetFormBody(form),
      });
      toast.success(`„${item.title}“ ist gespeichert.`);
      setSaveOpen(false);
      if (onCreated) {
        onCreated(item);
        return;
      }
      setCreated(item);
    } catch {
      // The create error is toasted by the global mutation handler.
    } finally {
      setBusy(false);
    }
  };

  const shell = ({ stage, controls }: DesignerParts) => (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
      <main
        // Die Bühne bemisst sich an dieser Fläche (Container-Einheiten), wie im Profilbild.
        className="flex min-w-0 flex-none flex-col items-center justify-center bg-background-alt px-6 py-4 md:flex-1 md:p-6 md:[container-type:size] lg:p-8"
      >
        <div className="w-full max-w-[420px] md:w-[min(560px,100cqw_-_48px,100cqh_-_48px)] md:max-w-none">
          {stage}
        </div>
      </main>
      <aside className="flex flex-col gap-5 p-5 md:w-[340px] md:flex-none md:overflow-y-auto md:border-l md:border-border md:p-6 lg:w-[400px] lg:p-7">
        <div className="flex flex-col gap-lg">{controls}</div>
      </aside>
    </div>
  );

  const doneCard = created ? (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-md overflow-y-auto bg-background-alt p-6 text-center">
      <PiCheckCircle aria-hidden="true" className="size-12 text-primary-600" />
      {draftUrl ? (
        <img src={draftUrl} alt="" className="max-h-[240px] max-w-full object-contain" />
      ) : null}
      <h2 className="m-0 text-lg font-semibold text-foreground-heading">Fertig!</h2>
      {returnTo === 'canvas' ? (
        <p className="m-0 max-w-[32rem] text-pretty text-foreground">
          „{created.title}“ ist gespeichert. Du findest ihn im Canvas in der Seitenleiste unter
          „Meine“ – du kannst diesen Tab jetzt schließen.
        </p>
      ) : (
        <p className="m-0 max-w-[32rem] text-pretty text-foreground">
          „{created.title}“ ist gespeichert und liegt in der Galerie unter „Meine“.
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-sm">
        {returnTo !== 'canvas' && (
          <Button asChild variant="brand">
            <Link to={profilbildAssetHref(created)}>Im Profilbild verwenden</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to={GALLERY_PATH}>Zur Galerie</Link>
        </Button>
        <Button type="button" variant="ghost" onClick={startOver}>
          Noch einen Sticker
        </Button>
      </div>
    </main>
  ) : null;

  return (
    <div className={cn('flex min-h-0 flex-col bg-background text-foreground', className)}>
      <header className="flex flex-none items-center justify-between gap-sm border-b border-border py-2.5 pr-4 pl-14 md:grid md:h-[72px] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-md md:px-6 md:py-0 lg:px-8">
        <div className="flex min-w-0 items-baseline gap-3.5">
          {heading}
          {description ? (
            <span className="hidden truncate text-[15px] text-muted-foreground xl:inline">
              {description}
            </span>
          ) : null}
        </div>
        {created ? (
          <span aria-hidden="true" />
        ) : (
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Art des Stickers"
            value={kind}
            onValueChange={(v) => {
              if (v && v !== kind) switchKind(v as CreatorKind);
            }}
          >
            {KINDS.map((k) => (
              <ToggleGroupItem key={k.value} value={k.value} className="h-9 gap-1.5 px-3">
                <k.icon aria-hidden="true" className="size-[18px]" />
                <span className="max-sm:sr-only">{k.label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <div className="flex flex-none items-center justify-end gap-2">
          {created ? null : (
            <Button
              type="button"
              variant="brand"
              disabled={!draft}
              onClick={() => {
                setError(null);
                setSaveOpen(true);
              }}
            >
              Sticker speichern
            </Button>
          )}
          {headerEnd}
        </div>
      </header>
      {doneCard ??
        (kind === 'badge' ? (
          <BadgeDesigner key={`badge-${session}`} locale={locale} onDraft={takeDraft}>
            {shell}
          </BadgeDesigner>
        ) : (
          <ImageStickerDesigner key={`image-${session}`} locale={locale} onDraft={takeDraft}>
            {shell}
          </ImageStickerDesigner>
        ))}
      <Dialog open={saveOpen && !created} onOpenChange={(open) => !busy && setSaveOpen(open)}>
        <DialogContent className="flex max-h-[min(90dvh,720px)] flex-col gap-md overflow-y-auto sm:max-w-[480px]">
          <div className="flex items-center gap-md">
            {draftUrl ? (
              <img
                src={draftUrl}
                alt=""
                className={cn(CHECKERBOARD, 'size-16 shrink-0 rounded-lg object-contain')}
              />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="m-0 text-lg font-semibold text-foreground-heading">
                Sticker speichern
              </DialogTitle>
              <DialogDescription className="m-0 text-sm text-muted-foreground">
                Er landet in der Galerie unter „Meine“.
              </DialogDescription>
            </div>
          </div>
          <form onSubmit={(e) => void save(e)} className="flex flex-col gap-md">
            <StudioAssetFormFields
              values={form}
              onChange={changeForm}
              locale={locale}
              disabled={busy}
            />
            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end gap-sm">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setSaveOpen(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" variant="brand" disabled={!canSave}>
                {busy ? 'Wird gespeichert …' : 'Speichern'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
