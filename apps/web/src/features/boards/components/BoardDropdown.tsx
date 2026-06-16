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

import type { BoardSettingsSection } from './board-overview/settings/BoardSettingsOverlay';

interface BoardDropdownProps {
  boardId: string;
  isArchived: boolean;
  expertMode: boolean;
  onDelete: () => void;
  onArchiveToggle: () => void;
  onExpertModeToggle: () => void;
  onRequestRename: () => void;
  // Board-overview actions (kanban boards only — omitted for whiteboards).
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  onDuplicate?: () => void;
  // When provided (kanban), share + destructive actions route into the full
  // settings overlay instead of the dropdown's own dialogs.
  onOpenFullSettings?: (section: BoardSettingsSection) => void;
}

export const BoardDropdown = memo(function BoardDropdown({
  boardId,
  isArchived,
  expertMode,
  onDelete,
  onArchiveToggle,
  onExpertModeToggle,
  onRequestRename,
  onOpenSettings,
  onOpenActivity,
  onDuplicate,
  onOpenFullSettings,
}: BoardDropdownProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const navigate = useNavigate();

  // Kanban boards consolidate share/duplicate/archive/delete into the overlay;
  // whiteboards (no overlay) keep the dropdown's own dialogs.
  const consolidated = Boolean(onOpenFullSettings);

  return (
    <>
      {!consolidated && (
        <ShareBoardDialog boardId={boardId} open={shareOpen} onOpenChange={setShareOpen} />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center justify-center w-7 h-7 rounded-md text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-[#2a2a2a] bg-transparent border-none cursor-pointer transition-colors">
            <FiMoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuItem onClick={onRequestRename}>
            <FiEdit2 className="mr-2" size={14} />
            Umbenennen
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExpertModeToggle}>
            <FiSliders className="mr-2" size={14} />
            Expert*innenmodus
            {expertMode && <FiCheck className="ml-auto" size={14} />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => (consolidated ? onOpenFullSettings?.('share') : setShareOpen(true))}
          >
            <FiShare2 className="mr-2" size={14} />
            Teilen
          </DropdownMenuItem>
          {onOpenActivity && (
            <DropdownMenuItem onClick={onOpenActivity}>
              <FiActivity className="mr-2" size={14} />
              Aktivität anzeigen
            </DropdownMenuItem>
          )}

          {consolidated ? (
            onOpenSettings && (
              <DropdownMenuItem onClick={onOpenSettings}>
                <FiSettings className="mr-2" size={14} />
                Board-Einstellungen
              </DropdownMenuItem>
            )
          ) : (
            <>
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate}>
                  <FiCopy className="mr-2" size={14} />
                  Board duplizieren
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
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Whiteboard fallback delete confirm — kanban deletes from the overlay. */}
      {!consolidated && (
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
      )}
    </>
  );
});
