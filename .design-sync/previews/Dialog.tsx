import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@gruenerator/ui';

// Overlay component: render in the controlled `open` state so the card shows
// the dialog itself (cfg.overrides.Dialog pins cardMode single + a viewport so
// the portalled content renders inside the card instead of escaping).
export function ConfirmPublish() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pressemitteilung veröffentlichen?</DialogTitle>
          <DialogDescription>
            Die Mitteilung wird sofort auf der Website und im Presseverteiler
            sichtbar. Dieser Schritt kann nicht rückgängig gemacht werden.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Abbrechen</Button>
          <Button variant="brand">Veröffentlichen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
