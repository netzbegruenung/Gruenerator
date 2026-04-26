import { Leaf } from 'lucide-react';

import { NotebookChatProvider } from '../../runtime/NotebookChatProvider';
import { ChatModalDialog } from '../modal/ChatModalDialog';
import { ModalThread } from './ModalThread';

export interface GruenOMatDialogProps {
  open: boolean;
  onClose: () => void;
  collectionId?: string;
  collectionName?: string;
  title?: string;
  endpoint?: string;
  suggestions?: string[];
}

const PoweredByFooter = () => (
  <a
    href="https://gruen-o-mat.eu"
    target="_blank"
    rel="noopener noreferrer"
    className="text-[10px] text-foreground-muted transition-colors hover:text-foreground"
  >
    Powered by Grünerator
  </a>
);

export function GruenOMatDialog({
  open,
  onClose,
  collectionId = 'gruene-de-system',
  collectionName = 'gruene.de',
  title = 'Grün-O-Mat',
  endpoint = '/api/gruen-o-mat/stream',
  suggestions,
}: GruenOMatDialogProps) {
  const collection = {
    id: collectionId,
    name: collectionName,
    linkType: 'url' as const,
  };

  return (
    <NotebookChatProvider collections={[collection]} mode="fast" endpoint={endpoint}>
      <ChatModalDialog
        open={open}
        onClose={onClose}
        title={title}
        headerIcon={<Leaf className="size-4" />}
        footer={<PoweredByFooter />}
      >
        <ModalThread suggestions={suggestions} className="flex-1" />
      </ChatModalDialog>
    </NotebookChatProvider>
  );
}
