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
import { type RefObject } from 'react';

interface ConfirmAlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function ConfirmAlert({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = 'destructive',
  onConfirm,
  returnFocusRef,
}: ConfirmAlertProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // The menu item that opened this is unmounted; Radix would drop focus on <body>.
          const target = returnFocusRef?.current;
          if (target?.isConnected) {
            e.preventDefault();
            target.focus();
          }
        }}
      >
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
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function DeleteSiteDialog({
  open,
  onOpenChange,
  onConfirm,
  returnFocusRef,
}: DeleteSiteDialogProps) {
  return (
    <ConfirmAlert
      open={open}
      onOpenChange={onOpenChange}
      title="Website löschen?"
      description="Die Website ist sofort offline und liegt 30 Tage im Papierkorb."
      confirmLabel="Löschen"
      onConfirm={onConfirm}
      returnFocusRef={returnFocusRef}
    />
  );
}
