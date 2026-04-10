import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { FiFile, FiGrid, FiPlus } from 'react-icons/fi';

interface CreateDocumentFABProps {
  onCreateBlank: () => void;
  onShowGallery: () => void;
}

export function CreateDocumentFAB({ onCreateBlank, onShowGallery }: CreateDocumentFABProps) {
  return (
    <div className="hidden max-sm:fixed max-sm:bottom-5 max-sm:right-5 max-sm:z-[100] max-sm:block">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="lg"
            className="h-[52px] w-[52px] rounded-full bg-[#5F8575] shadow-[0_4px_12px_rgba(0,0,0,0.15),0_2px_4px_rgba(0,0,0,0.1)] hover:bg-[#5F8575]/90"
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
