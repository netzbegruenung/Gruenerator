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
import { useId, useState, type FormEvent, type JSX } from 'react';

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
  /** Shares an image picked elsewhere (the Profilbild's own photo) instead of asking for a file. */
  initialFile?: File;
  onCreated?: () => void;
}

export function BackgroundUploadDialog({
  onClose,
  initialFile,
  onCreated,
}: BackgroundUploadDialogProps): JSX.Element {
  const fileId = useId();
  const locale = useAuthStore((s) => s.locale);
  const { create } = useStudioAssetMutations();

  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [form, setForm] = useState<StudioAssetFormValues>(() => ({
    title: initialFile ? titleFromFile(initialFile.name) : '',
    tags: '',
    visibility: initialFile ? 'public' : 'private',
    audience: locale,
    rights: false,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!file && isAssetFormComplete(form) && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !canSubmit) return;
    setBusy(true);
    setError(null);
    let shareToken: string | null;
    try {
      const blob = await prepareBackgroundImage(file);
      const ext = blob.type === 'image/webp' ? 'webp' : 'png';
      shareToken = await uploadBlobToMediaShare(blob, {
        filename: `${titleFromFile(file.name) || 'hintergrund'}.${ext}`,
        uploadSource: 'studio-asset',
      });
    } catch (err) {
      shareToken = null;
      if (err instanceof BackgroundImageError) {
        setError(err.message);
        setBusy(false);
        return;
      }
    }
    if (!shareToken) {
      setError(UPLOAD_ERROR);
      setBusy(false);
      return;
    }
    try {
      await create.mutateAsync({
        shareToken,
        kind: 'background',
        source: 'upload',
        ...assetFormBody(form),
      });
      toast.success(`„${form.title.trim()}“ ist gespeichert.`);
      onCreated?.();
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
            <DialogTitle>
              {initialFile ? 'Hintergrund teilen' : 'Hintergrund hochladen'}
            </DialogTitle>
            <DialogDescription>
              {initialFile
                ? 'Dein Bild wird zusätzlich als Hintergrund unter „Sticker & Hintergründe“ gespeichert.'
                : `PNG, JPEG oder WebP. Große Bilder werden auf ${BACKGROUND_MAX_SIDE} Pixel verkleinert.`}
            </DialogDescription>
          </DialogHeader>

          {initialFile ? null : (
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
          )}
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
              {busy ? 'Wird hochgeladen …' : initialFile ? 'Speichern' : 'Hochladen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
