import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@gruenerator/ui';

// Overlay component: rendered in the controlled `open` state so the card shows
// the surface itself (cfg.overrides.AlertDialog pins cardMode single + viewport).
// Destructive confirmation: cancel (outline) + action (brand) footer.
export function DeleteCampaign() {
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kampagne wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Die Kampagne „Klimaschutz vor Ort" und alle zugehörigen Entwürfe, Termine und
            Statistiken werden dauerhaft entfernt. Dieser Schritt kann nicht rückgängig gemacht
            werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction>Endgültig löschen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
