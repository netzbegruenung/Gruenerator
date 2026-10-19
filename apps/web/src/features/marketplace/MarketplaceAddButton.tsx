import { Button } from '@gruenerator/ui';
import { useState, type JSX } from 'react';
import { PiPlus } from 'react-icons/pi';

import { MarketplaceAddDialog } from './add/MarketplaceAddDialog';

/**
 * „+" in the Marktplatz header: share something you already have. Creating
 * new Agents, Rezepte, Vorlagen or Sticker happens on their own pages.
 */
export function MarketplaceAddButton(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Element hinzufügen"
        title="Element hinzufügen"
        onClick={() => setOpen(true)}
      >
        <PiPlus aria-hidden className="size-[18px]" />
      </Button>
      <MarketplaceAddDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
