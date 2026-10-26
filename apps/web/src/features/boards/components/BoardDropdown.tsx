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
import { memo, useState, type ReactNode } from 'react';
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
import { PiStar, PiStarFill } from 'react-icons/pi';

import { type NativeEditorBarAction, useNativeEditorBar } from '../../../hooks/useNativeEditorBar';

import { ShareBoardDialog } from './ShareBoardDialog';

import type { BoardSettingsSection } from './board-overview/settings/BoardSettingsOverlay';

interface BoardMenuItem extends NativeEditorBarAction {
  icon: ReactNode;
  /** Only below `sm`: on a wider screen the header carries it. */
  phoneOnly?: boolean;
}

interface BoardDropdownProps {
  boardId: string;
  title: string;
  isArchived: boolean;
  /** Connection is read-only: only actions a viewer may take (duplicate, activity). */
  readOnly?: boolean;
  expertMode: boolean;
  onDelete: () => void;
  onArchiveToggle: () => void;
  onExpertModeToggle: () => void;
  onRename: (title: string) => void;
  // Board-overview actions (kanban boards only — omitted for whiteboards).
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  onDuplicate?: () => void;
  // When provided (kanban), share + destructive actions route into the full
  // settings overlay instead of the dropdown's own dialogs.
  onOpenFullSettings?: (section: BoardSettingsSection) => void;
  // Phone only: the header has no room for its star there.
  isFavourite: boolean;
  onToggleFavourite: () => void;
}

export const BoardDropdown = memo(function BoardDropdown({
  boardId,
  title,
  isArchived,
  readOnly,
  expertMode,
  onDelete,
  onArchiveToggle,
  onExpertModeToggle,
  onRename,
  onOpenSettings,
  onOpenActivity,
  onDuplicate,
  onOpenFullSettings,
  isFavourite,
  onToggleFavourite,
}: BoardDropdownProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(title);

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

  // Kanban boards consolidate share/duplicate/archive/delete into the overlay;
  // whiteboards (no overlay) keep the dropdown's own dialogs.
  const consolidated = Boolean(onOpenFullSettings);

  // One list for both menus: the dropdown below and the app's native "…" menu.
  const items: BoardMenuItem[] = [
    {
      id: 'favourite',
      label: isFavourite ? 'Aus Favoriten entfernen' : 'Zu Favoriten',
      icon: isFavourite ? (
        <PiStarFill className="mr-2 text-primary-600" size={14} />
      ) : (
        <PiStar className="mr-2" size={14} />
      ),
      run: onToggleFavourite,
      phoneOnly: true,
    },
    ...(readOnly
      ? []
      : [
          {
            id: 'rename',
            label: 'Umbenennen',
            icon: <FiEdit2 className="mr-2" size={14} />,
            run: openRename,
          },
        ]),
    {
      id: 'expert-mode',
      label: 'Expert*innenmodus',
      icon: <FiSliders className="mr-2" size={14} />,
      run: onExpertModeToggle,
      checked: expertMode,
    },
    ...(readOnly
      ? []
      : [
          {
            id: 'share',
            label: 'Teilen',
            icon: <FiShare2 className="mr-2" size={14} />,
            run: () => (consolidated ? onOpenFullSettings?.('share') : setShareOpen(true)),
          },
        ]),
    ...(onOpenActivity
      ? [
          {
            id: 'activity',
            label: 'Aktivität anzeigen',
            icon: <FiActivity className="mr-2" size={14} />,
            run: onOpenActivity,
          },
        ]
      : []),
    // The settings overlay is all writes; duplicating only needs read access.
    ...(onDuplicate && (readOnly || !consolidated)
      ? [
          {
            id: 'duplicate',
            label: 'Board duplizieren',
            icon: <FiCopy className="mr-2" size={14} />,
            run: onDuplicate,
          },
        ]
      : []),
    ...(!readOnly && consolidated && onOpenSettings
      ? [
          {
            id: 'settings',
            label: 'Board-Einstellungen',
            icon: <FiSettings className="mr-2" size={14} />,
            run: onOpenSettings,
          },
        ]
      : []),
    ...(!readOnly && !consolidated
      ? [
          {
            id: 'archive',
            label: isArchived ? 'Board wiederherstellen' : 'Board archivieren',
            icon: <FiArchive className="mr-2" size={14} />,
            run: onArchiveToggle,
          },
          {
            id: 'delete',
            label: 'Board löschen',
            icon: <FiTrash2 className="mr-2" size={14} />,
            run: () => setDeleteConfirmOpen(true),
            destructive: true,
          },
        ]
      : []),
  ];

  // In the app the bar is native: rename is its title, share its button, and
  // the rest its menu. The dialogs below stay, the trigger goes.
  const share = items.find((item) => item.id === 'share');
  const nativeBar = useNativeEditorBar({
    title,
    canEdit: !readOnly,
    onRename,
    onShare: share?.run,
    actions: items.filter((item) => item.id !== 'share' && item.id !== 'rename'),
  });

  return (
    <>
      {!consolidated && (
        <ShareBoardDialog boardId={boardId} open={shareOpen} onOpenChange={setShareOpen} />
      )}

      {!nativeBar && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Board-Menü"
              className="flex items-center justify-center w-7 h-7 max-sm:w-11 max-sm:h-11 rounded-md text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-[#2a2a2a] bg-transparent border-none cursor-pointer transition-colors"
            >
              <FiMoreHorizontal size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
            {items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={item.run}
                className={
                  item.phoneOnly ? 'sm:hidden' : item.destructive ? 'text-red-600' : undefined
                }
              >
                {item.icon}
                {item.label}
                {item.checked && <FiCheck className="ml-auto" size={14} />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

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

      {/* Whiteboard fallback delete confirm — kanban deletes from the overlay. */}
      {!consolidated && (
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Board löschen?</DialogTitle>
              <DialogDescription>
                Dieses Board und alle Karten werden in den Papierkorb verschoben und können 30 Tage
                lang wiederhergestellt werden.
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
                  // Where to go after deleting is the page's decision, not the
                  // menu's: `BoardPage` navigates once the mutation actually
                  // succeeds, and does it host-aware. This second navigation
                  // fired immediately and unconditionally — inside the app's
                  // WebView it landed on a chrome-less `/workplace` the user
                  // could not leave.
                  onDelete();
                  setDeleteConfirmOpen(false);
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
