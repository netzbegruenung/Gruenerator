import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { type MutableRefObject, memo, useState, useCallback } from 'react';
import { HiOutlineDocumentText } from 'react-icons/hi';
import { PiPlus, PiChatCircle, PiVideoCamera } from 'react-icons/pi';

import { iconClass, menuLinkClass } from './sidebarStyles';

interface NewItemDropdownProps {
  openRef: MutableRefObject<boolean>;
  titleClass: string;
  onChatClick: () => void;
  onLinkClick: (path: string, title: string) => void;
  onClose: () => void;
}

const NewItemDropdown = memo(function NewItemDropdown({
  openRef,
  titleClass,
  onChatClick,
  onLinkClick,
  onClose,
}: NewItemDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      openRef.current = isOpen;
    },
    [openRef]
  );

  return (
    <div className="flex flex-col gap-0.5 p-0 mt-xs">
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button className={menuLinkClass(false)} type="button">
            <PiPlus aria-hidden="true" className={iconClass} />
            <span className={titleClass}>Neu</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={8}>
          <DropdownMenuItem
            onClick={() => {
              onChatClick();
              onClose();
            }}
          >
            <PiChatCircle />
            <span>Neuer Chat</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onLinkClick('/docs', 'Dokumente')}>
            <HiOutlineDocumentText />
            <span>Neues Dokument</span>
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
