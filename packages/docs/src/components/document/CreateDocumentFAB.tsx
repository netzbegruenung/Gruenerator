import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useMeasuredCornerReservation,
} from '@gruenerator/ui';
import { useRef } from 'react';
import { FiFile, FiGrid, FiPlus } from 'react-icons/fi';

const FAB_CORNER = 'bottom-right';

interface CreateDocumentFABProps {
  onCreateBlank: () => void;
  onShowGallery: () => void;
}

export function CreateDocumentFAB({ onCreateBlank, onShowGallery }: CreateDocumentFABProps) {
  const fabRef = useRef<HTMLDivElement>(null);

  // Nur unter `sm` überhaupt sichtbar — die Messung liefert dort 0×0 und meldet
  // von selbst nichts an, sobald der FAB ausgeblendet ist.
  useMeasuredCornerReservation(fabRef, { corner: FAB_CORNER, axis: 'vertical' });

  return (
    <div
      ref={fabRef}
      className="hidden max-sm:fixed max-sm:bottom-5 max-sm:right-5 max-sm:z-[100] max-sm:block"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="lg"
            className="h-[52px] w-[52px] rounded-full bg-[#587C6D] shadow-[0_4px_12px_rgba(0,0,0,0.15),0_2px_4px_rgba(0,0,0,0.1)] hover:bg-[#587C6D]/90"
            aria-label="Neues Dokument erstellen"
          >
            <FiPlus size={24} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" sideOffset={8}>
          <DropdownMenuLabel>Neues Dokument</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onCreateBlank}>
            <FiFile size={16} />
            Leeres Dokument
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onShowGallery}>
            <FiGrid size={16} />
            Aus Vorlage...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
