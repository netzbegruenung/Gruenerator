import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useState, type JSX } from 'react';
import { PiFileText, PiLayout, PiPlus, PiSparkle, PiSticker } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import AddTemplateModal from '../../components/common/AddTemplateModal/AddTemplateModal';

/**
 * „+" in the Marktplatz header: start your own Agent, Rezept, Vorlage or
 * Sticker. Vorlagen open their dialog right here; the rest have their own
 * creator pages.
 */
export function MarketplaceCreateMenu(): JSX.Element {
  const navigate = useNavigate();
  const [templateOpen, setTemplateOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Inhalt hinzufügen"
            title="Inhalt hinzufügen"
          >
            <PiPlus aria-hidden className="size-[18px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate('/agents/new')}>
            <PiSparkle />
            <span>Agent</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/agentura/rezept/neu')}>
            <PiFileText />
            <span>Rezept</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
            <PiLayout />
            <span>Vorlage</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/studio/sticker/neu')}>
            <PiSticker />
            <span>Sticker</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddTemplateModal isOpen={templateOpen} onClose={() => setTemplateOpen(false)} />
    </>
  );
}
