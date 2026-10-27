import { type StudioAssetItem } from '@gruenerator/contracts';
import { STUDIO_ASSET_RIGHTS_LABEL } from '@gruenerator/shared/studio-assets';
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
} from '@gruenerator/ui';
import { useId, useState, type FormEvent, type JSX } from 'react';

const TITLE_MAX = 120;

interface AssetDialogProps {
  item: StudioAssetItem;
  busy: boolean;
  onClose: () => void;
}

/** Making an item public needs the explicit rights confirmation the API requires. */
export function PublishDialog({
  item,
  busy,
  onClose,
  onConfirm,
}: AssetDialogProps & { onConfirm: () => void }): JSX.Element {
  const checkboxId = useId();
  const [rights, setRights] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-background-pure">
        <DialogHeader>
          <DialogTitle>Öffentlich machen</DialogTitle>
          <DialogDescription>
            „{item.title}“ erscheint dann im Marktplatz und alle können es in ihren Bildern
            verwenden.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-sm">
          <Checkbox
            id={checkboxId}
            checked={rights}
            onCheckedChange={(checked) => setRights(checked === true)}
            disabled={busy}
            className="mt-0.5"
          />
          <Label htmlFor={checkboxId} className="text-sm leading-snug font-normal">
            {STUDIO_ASSET_RIGHTS_LABEL}
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={onConfirm} disabled={!rights || busy}>
            Öffentlich machen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RenameDialog({
  item,
  busy,
  onClose,
  onSave,
}: AssetDialogProps & { onSave: (title: string) => void }): JSX.Element {
  const inputId = useId();
  const [title, setTitle] = useState(item.title);
  const trimmed = title.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (trimmed && !busy) onSave(trimmed);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-background-pure">
        <form onSubmit={submit} className="flex flex-col gap-md">
          <DialogHeader>
            <DialogTitle>Umbenennen</DialogTitle>
            <DialogDescription>Gib einen neuen Titel ein.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-xs">
            <Label htmlFor={inputId}>Titel</Label>
            <Input
              id={inputId}
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={!trimmed || busy}>
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
