import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@gruenerator/ui';
import { useState } from 'react';

import type { NotebookCollection } from '../../../types/notebook';

interface RenameNotebookDialogProps {
  collection: NotebookCollection;
  isUpdating: boolean;
  onCancel: () => void;
  onSubmit: (name: string, description: string) => void;
}

export function RenameNotebookDialog({
  collection,
  isUpdating,
  onCancel,
  onSubmit,
}: RenameNotebookDialogProps) {
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? '');
  const canSave = name.trim().length > 0 && !isUpdating;

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Notebook umbenennen</DialogTitle>
        <DialogDescription>
          Ändere den Namen und die Beschreibung deines Notebooks.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-md py-sm">
        <div className="flex flex-col gap-xs">
          <Label htmlFor="rename-name">Name</Label>
          <Input
            id="rename-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-xs">
          <Label htmlFor="rename-description">Beschreibung</Label>
          <Input
            id="rename-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isUpdating}>
          Abbrechen
        </Button>
        <Button onClick={() => onSubmit(name.trim(), description.trim())} disabled={!canSave}>
          Speichern
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default RenameNotebookDialog;
