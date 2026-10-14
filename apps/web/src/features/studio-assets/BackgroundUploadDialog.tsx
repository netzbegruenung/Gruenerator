import { type GroupAudience, type StudioAssetVisibility } from '@gruenerator/contracts';
import { useStudioAssetMutations } from '@gruenerator/shared/studio-assets';
import {
  Button,
  Checkbox,
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
import { RIGHTS_LABEL } from './StudioAssetDialogs';

const TITLE_MAX = 120;
const TAG_MAX = 30;
const TAGS_MAX = 10;
const UPLOAD_ERROR = 'Das Hochladen hat nicht geklappt. Bitte versuche es erneut.';

const COUNTRY_LABEL = { 'de-DE': 'Deutschland', 'de-AT': 'Österreich' } as const;

const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, '').slice(0, TITLE_MAX);

const parseTags = (raw: string) =>
  [
    ...new Set(
      raw
        .split(',')
        .map((t) => t.trim().slice(0, TAG_MAX))
        .filter(Boolean)
    ),
  ].slice(0, TAGS_MAX);

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
  const ids = { file: useId(), title: useId(), tags: useId(), share: useId(), rights: useId() };
  const audienceName = useId();
  const locale = useAuthStore((s) => s.locale);
  const { create } = useStudioAssetMutations();

  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [title, setTitle] = useState(() => (initialFile ? titleFromFile(initialFile.name) : ''));
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<StudioAssetVisibility>(
    initialFile ? 'public' : 'private'
  );
  const [audience, setAudience] = useState<GroupAudience>(locale);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPublic = visibility === 'public';
  const canSubmit = !!file && title.trim() !== '' && (!isPublic || rights) && !busy;

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
        title: title.trim(),
        tags: parseTags(tags),
        visibility,
        audience,
        rightsConfirmed: isPublic && rights,
      });
      toast.success(`„${title.trim()}“ ist gespeichert.`);
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
              <Label htmlFor={ids.file}>Bild</Label>
              <Input
                id={ids.file}
                type="file"
                accept={BACKGROUND_ACCEPT}
                disabled={busy}
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  setFile(picked);
                  setError(null);
                  if (picked && !title.trim()) setTitle(titleFromFile(picked.name));
                }}
              />
            </div>
          )}
          <div className="flex flex-col gap-xs">
            <Label htmlFor={ids.title}>Titel</Label>
            <Input
              id={ids.title}
              value={title}
              maxLength={TITLE_MAX}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor={ids.tags}>Schlagwörter (optional, mit Komma getrennt)</Label>
            <Input
              id={ids.tags}
              value={tags}
              disabled={busy}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-sm">
            <Checkbox
              id={ids.share}
              checked={isPublic}
              disabled={busy}
              onCheckedChange={(checked) => setVisibility(checked === true ? 'public' : 'private')}
              className="mt-0.5"
            />
            <Label htmlFor={ids.share} className="text-sm leading-snug font-normal">
              Unter „Entdecken“ öffentlich teilen
            </Label>
          </div>

          {isPublic && (
            <>
              <fieldset className="m-0 flex flex-wrap gap-md border-0 p-0 text-sm">
                <legend className="mb-xs text-sm font-medium text-foreground">Sichtbar für</legend>
                {([locale, 'all'] as const).map((value) => (
                  <label key={value} className="flex items-center gap-xs">
                    <input
                      type="radio"
                      name={audienceName}
                      value={value}
                      checked={audience === value}
                      disabled={busy}
                      onChange={() => setAudience(value)}
                      className="accent-primary-600"
                    />
                    {value === 'all' ? 'Alle' : COUNTRY_LABEL[value]}
                  </label>
                ))}
              </fieldset>
              <div className="flex items-start gap-sm">
                <Checkbox
                  id={ids.rights}
                  checked={rights}
                  disabled={busy}
                  onCheckedChange={(checked) => setRights(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor={ids.rights} className="text-sm leading-snug font-normal">
                  {RIGHTS_LABEL}
                </Label>
              </div>
            </>
          )}

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
