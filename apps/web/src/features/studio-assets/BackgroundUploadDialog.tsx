import { type StudioAssetItem } from '@gruenerator/contracts';
import {
  assetFormBody,
  isAssetFormComplete,
  TITLE_MAX,
  useStudioAssetMutations,
  type StudioAssetFormValues,
} from '@gruenerator/shared/studio-assets';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@gruenerator/ui';
import { useId, useRef, useState, type FormEvent, type JSX } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { uploadBlobToMediaShare } from '../image-studio/services/mediaUploadService';

import {
  BACKGROUND_ACCEPT,
  BACKGROUND_MAX_SIDE,
  BackgroundImageError,
  prepareBackgroundImage,
} from './backgroundImage';
import { StudioAssetFormFields } from './StudioAssetFormFields';

const UPLOAD_ERROR = 'Das Hochladen hat nicht geklappt. Bitte versuche es erneut.';

const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, '').slice(0, TITLE_MAX);

export interface BackgroundUploadDialogProps {
  onClose: () => void;
  /** Gets the new gallery item, e.g. to apply it right away. */
  onCreated?: (item: StudioAssetItem) => void;
}

export function BackgroundUploadDialog({
  onClose,
  onCreated,
}: BackgroundUploadDialogProps): JSX.Element {
  const fileId = useId();
  const locale = useAuthStore((s) => s.locale);
  const { create } = useStudioAssetMutations();

  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<StudioAssetFormValues>(() => ({
    title: '',
    tags: '',
    visibility: 'private',
    audience: locale,
    rights: false,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A retry after a failed create reuses the upload instead of orphaning another file.
  const uploaded = useRef<{ file: File; token: string } | null>(null);

  const canSubmit = !!file && isAssetFormComplete(form) && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !canSubmit) return;
    setBusy(true);
    setError(null);
    let shareToken = uploaded.current?.file === file ? uploaded.current.token : null;
    if (!shareToken) {
      try {
        const blob = await prepareBackgroundImage(file);
        const ext = blob.type === 'image/webp' ? 'webp' : 'png';
        shareToken = await uploadBlobToMediaShare(blob, {
          filename: `${titleFromFile(file.name) || 'hintergrund'}.${ext}`,
          uploadSource: 'studio-asset',
        });
      } catch (err) {
        if (err instanceof BackgroundImageError) {
          setError(err.message);
          setBusy(false);
          return;
        }
      }
    }
    if (!shareToken) {
      setError(UPLOAD_ERROR);
      setBusy(false);
      return;
    }
    uploaded.current = { file, token: shareToken };
    try {
      const item = await create.mutateAsync({
        shareToken,
        kind: 'background',
        source: 'upload',
        ...assetFormBody(form),
      });
      toast.success(`„${form.title.trim()}“ ist gespeichert.`);
      onCreated?.(item);
      onClose();
    } catch {
      // The create error is toasted by the global mutation handler.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="bg-background-pure">
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-md">
          <DialogHeader>
            <DialogTitle>Hintergrund hochladen</DialogTitle>
            <DialogDescription>
              {`PNG, JPEG oder WebP. Große Bilder werden auf ${BACKGROUND_MAX_SIDE} Pixel verkleinert.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-xs">
            <Label htmlFor={fileId}>Bild</Label>
            <Input
              id={fileId}
              type="file"
              accept={BACKGROUND_ACCEPT}
              disabled={busy}
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                setError(null);
                if (picked && !form.title.trim())
                  setForm((f) => ({ ...f, title: titleFromFile(picked.name) }));
              }}
            />
          </div>
          <StudioAssetFormFields values={form} onChange={setForm} locale={locale} disabled={busy} />

          {error && (
            <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? 'Wird hochgeladen …' : 'Hochladen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
