import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useIsMobile,
} from '@gruenerator/ui';
import { useMutation } from '@tanstack/react-query';
import { type MutableRefObject, memo, useCallback, useState } from 'react';
import { HiOutlineDocumentText } from 'react-icons/hi';
import {
  PiChatCircle,
  PiImageSquare,
  PiKanban,
  PiPencilLine,
  PiPlus,
  PiVideoCamera,
} from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { useBoardsTyped } from '../../../hooks/useBoardsTyped';
import apiClient from '../../utils/apiClient';

import { iconClass, menuLinkClass } from './sidebarStyles';

interface NewItemDropdownProps {
  openRef: MutableRefObject<boolean>;
  titleClass: string;
  collapsed: boolean;
  onChatClick: () => void;
  onLinkClick: (path: string, title: string) => void;
  onClose: () => void;
}

const NewItemDropdown = memo(function NewItemDropdown({
  openRef,
  titleClass,
  collapsed,
  onChatClick,
  onLinkClick,
  onClose,
}: NewItemDropdownProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { createBoard } = useBoardsTyped({ enabled: false });

  const createEmptyDoc = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/docs', { title: 'Neues Dokument' });
      return res.data as { id: string };
    },
  });

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      openRef.current = isOpen;
    },
    [openRef]
  );

  const handleCreateDoc = useCallback(() => {
    createEmptyDoc.mutate(undefined, {
      onSuccess: (data) => {
        void navigate(`/office/${data.id}`);
        onClose();
      },
    });
  }, [createEmptyDoc, navigate, onClose]);

  const handleCreateBoard = useCallback(() => {
    createBoard.mutate(
      { title: 'Neues Board' },
      {
        onSuccess: (board) => {
          void navigate(`/boards/${board.id}`);
          onClose();
        },
      }
    );
  }, [createBoard, navigate, onClose]);

  const handleCreateWhiteboard = useCallback(() => {
    createBoard.mutate(
      { title: 'Neues Whiteboard', boardType: 'whiteboard' },
      {
        onSuccess: (board) => {
          void navigate(`/boards/${board.id}`);
          onClose();
        },
      }
    );
  }, [createBoard, navigate, onClose]);

  return (
    <div className="flex flex-col gap-0 p-0">
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button className={menuLinkClass(false, false, collapsed)} type="button">
            <PiPlus aria-hidden="true" className={iconClass} />
            <span className={titleClass}>Neu</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={isMobile ? 'bottom' : 'right'}
          align="start"
          sideOffset={8}
          className="bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl"
        >
          <DropdownMenuItem
            onClick={() => {
              onChatClick();
              onClose();
            }}
          >
            <PiChatCircle />
            <span>Neuer Chat</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCreateDoc}>
            <HiOutlineDocumentText />
            <span>Neues Dokument</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCreateBoard}>
            <PiKanban />
            <span>Neues Board</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCreateWhiteboard}>
            <PiPencilLine />
            <span>Neues Whiteboard</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onLinkClick('/bild-editor', 'Bild erstellen')}>
            <PiImageSquare />
            <span>Bild erstellen</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onLinkClick('/reel', 'Reel')}>
            <PiVideoCamera />
            <span>Neues Video</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

export default NewItemDropdown;
