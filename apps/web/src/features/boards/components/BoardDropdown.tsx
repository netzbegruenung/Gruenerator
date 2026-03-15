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
} from '@gruenerator/ui';
import { memo, useState } from 'react';
import { FiMoreHorizontal, FiTrash2, FiArchive, FiShare2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { ShareBoardDialog } from './ShareBoardDialog';

interface BoardDropdownProps {
  boardId: string;
  isArchived: boolean;
  onDelete: () => void;
  onArchiveToggle: () => void;
}

export const BoardDropdown = memo(function BoardDropdown({
  boardId,
  isArchived,
  onDelete,
  onArchiveToggle,
}: BoardDropdownProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <ShareBoardDialog boardId={boardId} open={shareOpen} onOpenChange={setShareOpen} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center justify-center w-7 h-7 rounded-md text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-[#2a2a2a] bg-transparent border-none cursor-pointer transition-colors">
            <FiMoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShareOpen(true)}>
            <FiShare2 className="mr-2" size={14} />
            Teilen
          </DropdownMenuItem>
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
                navigate('/boards');
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
