import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@gruenerator/ui';
import { memo, useState } from 'react';
import {
  FiMoreHorizontal,
  FiTrash2,
  FiArchive,
  FiShare2,
  FiSliders,
  FiCheck,
  FiEdit2,
  FiSettings,
  FiActivity,
  FiCopy,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { ShareBoardDialog } from './ShareBoardDialog';

interface BoardDropdownProps {
  boardId: string;
  title: string;
  isArchived: boolean;
  expertMode: boolean;
  onDelete: () => void;
  onArchiveToggle: () => void;
  onExpertModeToggle: () => void;
  onRename: (title: string) => void;
  // Board-overview actions (kanban boards only — omitted for whiteboards).
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  onDuplicate?: () => void;
}

export const BoardDropdown = memo(function BoardDropdown({
  boardId,
  title,
  isArchived,
  expertMode,
  onDelete,
  onArchiveToggle,
  onExpertModeToggle,
  onRename,
  onOpenSettings,
  onOpenActivity,
  onDuplicate,
}: BoardDropdownProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const navigate = useNavigate();

  const openRename = () => {
    setRenameValue(title);
    setRenameOpen(true);
  };

  const submitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== title) {
      onRename(trimmed);
    }
    setRenameOpen(false);
  };

  return (
    <>
      <ShareBoardDialog boardId={boardId} open={shareOpen} onOpenChange={setShareOpen} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center justify-center w-7 h-7 rounded-md text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-[#2a2a2a] bg-transparent border-none cursor-pointer transition-colors">
            <FiMoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuItem onClick={openRename}>
            <FiEdit2 className="mr-2" size={14} />
            Umbenennen
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExpertModeToggle}>
            <FiSliders className="mr-2" size={14} />
            Expert*innenmodus
            {expertMode && <FiCheck className="ml-auto" size={14} />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShareOpen(true)}>
            <FiShare2 className="mr-2" size={14} />
            Teilen
          </DropdownMenuItem>
          {onDuplicate && (
            <DropdownMenuItem onClick={onDuplicate}>
              <FiCopy className="mr-2" size={14} />
              Board duplizieren
            </DropdownMenuItem>
          )}
          {onOpenActivity && (
            <DropdownMenuItem onClick={onOpenActivity}>
              <FiActivity className="mr-2" size={14} />
              Aktivität anzeigen
            </DropdownMenuItem>
          )}
          {onOpenSettings && (
            <DropdownMenuItem onClick={onOpenSettings}>
              <FiSettings className="mr-2" size={14} />
              Board-Einstellungen
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onArchiveToggle}>
            <FiArchive className="mr-2" size={14} />
            {isArchived ? 'Board wiederherstellen' : 'Board archivieren'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeleteConfirmOpen(true)} className="text-red-600">
            <FiTrash2 className="mr-2" size={14} />
            Board löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Board umbenennen</DialogTitle>
            <DialogDescription>Gib einen neuen Namen für dieses Board ein.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitRename();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="board-rename-input">Name</Label>
              <Input
                id="board-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Board-Name"
                autoFocus
              />
            </div>
            <DialogFooter className="mt-md">
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={!renameValue.trim()}>
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Board löschen?</DialogTitle>
            <DialogDescription>
              Dieses Board und alle Karten werden unwiderruflich gelöscht.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
              onClick={() => {
                onDelete();
                setDeleteConfirmOpen(false);
                void navigate('/workplace');
              }}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
