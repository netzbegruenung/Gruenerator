import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@gruenerator/ui';

interface ConfirmAlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
}

export function ConfirmAlert({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = 'destructive',
  onConfirm,
}: ConfirmAlertProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction variant={variant} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface DeleteSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteSiteDialog({ open, onOpenChange, onConfirm }: DeleteSiteDialogProps) {
  return (
    <ConfirmAlert
      open={open}
      onOpenChange={onOpenChange}
      title="Website löschen?"
      description="Die Website ist sofort offline und liegt 30 Tage im Papierkorb."
      confirmLabel="Löschen"
      onConfirm={onConfirm}
    />
  );
}
