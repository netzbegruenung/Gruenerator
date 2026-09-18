/**
 * Freigabe-Dialog für ein eigenes Rezept: Sichtbarkeit (privat / Projekte /
 * mit Anmeldung), die Projekte, in die es geteilt ist, und die Listung „Von
 * der Basis".
 *
 * Die Bedienelemente selbst stehen in {@link RecipeSharingPanel} — dieselbe
 * Fläche trägt der Teilen-Tab des Rezept-Editors. Hier bleibt nur die Hülle:
 * Dialog-Rahmen und „Link kopieren".
 *
 * Nur für Eigentümer*innen: Aufrufer prüfen das vorher — der Server antwortet
 * zwar ohnehin mit 404/403, den Dialog trotzdem zu zeigen wäre irreführend.
 */
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
} from '@gruenerator/ui';
import { PiLink } from 'react-icons/pi';

import { RecipeSharingPanel } from '../recipes/RecipeSharingPanel';

interface ShareRecipeModalProps {
  /** The recipe's mention — its handle on every sharing endpoint. */
  mention: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareRecipeModal({ mention, open, onOpenChange }: ShareRecipeModalProps) {
  const handleCopyLink = () => {
    void navigator.clipboard?.writeText(window.location.href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[42rem]">
        <DialogHeader>
          <DialogTitle>Rezept teilen</DialogTitle>
          <DialogDescription>
            Lege fest, wer dieses Rezept sehen und im Chat nutzen darf.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-2 flex max-h-[70vh] flex-col gap-md overflow-y-auto px-2">
          <RecipeSharingPanel mention={mention} enabled={open} />

          <Separator />

          <Button variant="outline" size="sm" className="self-start" onClick={handleCopyLink}>
            <PiLink className="mr-xs" />
            Link kopieren
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
