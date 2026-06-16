import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';

import { ShareSection } from './board-overview/settings/ShareSection';

interface ShareBoardDialogProps {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog wrapper around {@link ShareSection}. Used for whiteboard boards, which
 * have no full-settings overlay; kanban boards render `ShareSection` directly in
 * the settings overlay instead.
 */
export function ShareBoardDialog({ boardId, open, onOpenChange }: ShareBoardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Board teilen</DialogTitle>
          <DialogDescription>Verwalte, wer auf dieses Board zugreifen kann.</DialogDescription>
        </DialogHeader>
        <ShareSection boardId={boardId} showHeading={false} />
      </DialogContent>
    </Dialog>
  );
}
