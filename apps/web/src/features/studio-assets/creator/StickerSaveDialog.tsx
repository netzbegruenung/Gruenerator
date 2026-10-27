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
} from '@gruenerator/ui';
import { useRef, useState, type FormEvent, type JSX, type ReactNode } from 'react';

import { useAuthStore } from '../../../stores/authStore';
import { uploadBlobToMediaShare } from '../../image-studio/services/mediaUploadService';
import { CHECKERBOARD } from '../../studio-tools/components/ToolResultCard';
import { StudioAssetFormFields } from '../StudioAssetFormFields';

import { useObjectUrl, type StickerDraft } from './creatorParts';

import { cn } from '@/utils/cn';

const UPLOAD_ERROR = 'Das Hochladen hat nicht geklappt. Bitte versuche es erneut.';

/**
 * Title, tags and sharing for a finished sticker, then upload and create. Shared
 * by the quick creator and the sticker canvas; `children` adds export options.
 */
export function StickerSaveDialog({
  draft,
  open,
  onOpenChange,
  onSaved,
  children,
}: {
  draft: StickerDraft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: StudioAssetItem) => void;
  children?: ReactNode;
}): JSX.Element {
  const locale = useAuthStore((s) => s.locale);
  const { create } = useStudioAssetMutations();
  const [form, setForm] = useState<StudioAssetFormValues>(() => emptyAssetForm(locale));
  // Until the title is typed into, it follows the design (file name or badge text).
  const [titleTouched, setTitleTouched] = useState(false);
  const [suggested, setSuggested] = useState<string | null>(null);
  const uploaded = useRef<{ blob: Blob; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftUrl = useObjectUrl(draft?.blob ?? null);

  if (draft && draft.suggestedTitle !== suggested) {
    setSuggested(draft.suggestedTitle);
    if (!titleTouched) setForm((f) => ({ ...f, title: draft.suggestedTitle.slice(0, TITLE_MAX) }));
  }

  const changeForm = (next: StudioAssetFormValues) => {
    if (next.title !== form.title) setTitleTouched(true);
    setForm(next);
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
      onOpenChange(false);
      onSaved(item);
    } catch {
      // The create error is toasted by the global mutation handler.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[min(90dvh,720px)] flex-col gap-md overflow-y-auto sm:max-w-[480px]">
        <div className="flex items-center gap-md">
          {draftUrl ? (
            <img
              src={draftUrl}
              alt=""
              className={cn(CHECKERBOARD, 'size-24 shrink-0 rounded-lg object-contain')}
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
        {children}
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
              onClick={() => onOpenChange(false)}
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
  );
}
