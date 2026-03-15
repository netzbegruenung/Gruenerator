import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface CreateBoardDialogProps {
  onCreateBoard: (title: string) => void;
  isCreating: boolean;
}

export function CreateBoardDialog({ onCreateBoard, isCreating }: CreateBoardDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const boardTitle = title.trim() || 'Neues Board';
    onCreateBoard(boardTitle);
    setTitle('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Board erstellen</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Neues Board erstellen</DialogTitle>
            <DialogDescription>Gib deinem Board einen Namen.</DialogDescription>
          </DialogHeader>
          <div className="py-md">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Board-Name"
              autoFocus
              className="w-full rounded-md border border-grey-300 bg-background px-sm py-xs text-sm outline-none focus:border-primary-500 dark:border-grey-600"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? 'Erstellt...' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
