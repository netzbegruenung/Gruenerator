import { type StudioAssetItem } from '@gruenerator/contracts';
import { isAssetFormComplete, type StudioAssetFormValues } from '@gruenerator/shared/studio-assets';
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

import { BACKGROUND_ACCEPT, BACKGROUND_MAX_SIDE } from './backgroundImage';
import { StudioAssetFormFields } from './StudioAssetFormFields';
import {
  BackgroundUploadError,
  titleFromFile,
  useBackgroundAssetUpload,
} from './useBackgroundAssetUpload';

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
  const uploadBackground = useBackgroundAssetUpload();

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

  const canSubmit = !!file && isAssetFormComplete(form) && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const item = await uploadBackground(file, form);
      toast.success(`„${form.title.trim()}“ ist gespeichert.`);
      onCreated?.(item);
      onClose();
    } catch (err) {
      // Create errors are toasted by the global mutation handler.
      if (err instanceof BackgroundUploadError) setError(err.message);
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
