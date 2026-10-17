import { type CanvasEditorExportApi } from '@gruenerator/canvas-editor';
import {
  canvasFormatIdSchema,
  canvasVorlageFileEntrySchema,
  type CanvasVorlageFileEntry,
} from '@gruenerator/contracts';
import { slugifyName } from '@gruenerator/shared/utils';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
  Textarea,
  toast,
} from '@gruenerator/ui';
import { useId, useState, type FormEvent, type JSX, type RefObject } from 'react';
import { PiExport } from 'react-icons/pi';

import { useAuthStore } from '../../../stores/authStore';
import { downloadBlob } from '../../../utils/downloadFile';

const THUMB_WIDTH = 540;

async function webpThumb(dataUrl: string): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * THUMB_WIDTH);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('webp'))), 'image/webp', 0.85)
  );
}

/**
 * Instance admins only: the open design as a Grünerator-Vorlage — the
 * catalogue entry (`<id>.json`, into `sharepic-vorlagen/canvas/<land>.json`)
 * and its preview (`<id>.webp`, into `thumbs/canvas/`) of the private
 * content repo. The preview shows the active page.
 */
export function ExportCanvasVorlageButton({
  exportApi,
  formatId,
  transparent = false,
}: {
  exportApi: RefObject<CanvasEditorExportApi | null>;
  formatId: string;
  /** Preview without the page background, e.g. for stickers. */
  transparent?: boolean;
}): JSX.Element | null {
  const isAdmin = useAuthStore((s) => s.user?.is_admin === true);
  const locale = useAuthStore((s) => s.locale);
  const [open, setOpen] = useState(false);
  const [titel, setTitel] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [busy, setBusy] = useState(false);
  const titelId = useId();
  const beschreibungId = useId();

  const format = canvasFormatIdSchema.safeParse(formatId);
  if (!isAdmin || !format.success) return null;

  const exportVorlage = async (e: FormEvent) => {
    e.preventDefault();
    const api = exportApi.current;
    if (!api) return;
    setBusy(true);
    try {
      const entry: CanvasVorlageFileEntry = {
        id: slugifyName(titel, 'vorlage'),
        titel: titel.trim(),
        beschreibung: beschreibung.trim(),
        format: format.data,
        pages: api.getPages(),
      };
      const parsed = canvasVorlageFileEntrySchema.safeParse(entry);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        toast.error(`Export nicht möglich: ${issue?.path.join('.')} ${issue?.message ?? ''}`);
        return;
      }
      const dataUrl = await api.captureActivePage({ pixelRatio: 1, transparent });
      if (!dataUrl) throw new Error('capture');
      await downloadBlob(
        new Blob([`${JSON.stringify(parsed.data, null, 2)}\n`], { type: 'application/json' }),
        `${entry.id}.json`
      );
      await downloadBlob(await webpThumb(dataUrl), `${entry.id}.webp`);
      toast.success(
        `„${entry.titel}“ exportiert – Eintrag in canvas/${locale === 'de-AT' ? 'at' : 'de'}.json, Bild in thumbs/canvas/.`
      );
      setOpen(false);
    } catch {
      toast.error('Der Export hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-white hover:bg-white/15 hover:text-white"
        title="Als Grünerator-Vorlage exportieren"
        aria-label="Als Grünerator-Vorlage exportieren"
        onClick={() => setOpen(true)}
      >
        <PiExport aria-hidden="true" className="size-[18px]" />
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="flex flex-col gap-md sm:max-w-[440px]">
          <DialogTitle className="m-0 text-lg font-semibold">
            Als Grünerator-Vorlage exportieren
          </DialogTitle>
          <DialogDescription className="m-0 text-sm text-muted-foreground">
            Lädt den Katalog-Eintrag und das Vorschaubild für das interne Repo herunter.
          </DialogDescription>
          <form onSubmit={(e) => void exportVorlage(e)} className="flex flex-col gap-md">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={titelId}>Titel</Label>
              <Input
                id={titelId}
                value={titel}
                maxLength={80}
                required
                onChange={(e) => setTitel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={beschreibungId}>Beschreibung</Label>
              <Textarea
                id={beschreibungId}
                value={beschreibung}
                maxLength={280}
                rows={3}
                onChange={(e) => setBeschreibung(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-sm">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" variant="brand" disabled={busy || !titel.trim()}>
                {busy ? 'Wird exportiert …' : 'Exportieren'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
