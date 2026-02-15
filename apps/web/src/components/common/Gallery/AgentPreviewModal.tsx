import { useCallback } from 'react';

import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import type { GalleryItem } from './cards';

interface AgentPreviewModalProps {
  agent: GalleryItem;
  onClose: () => void;
}

const AgentPreviewModal = ({ agent, onClose }: AgentPreviewModalProps) => {
  const promptText = agent.prompt || agent.prompt_preview || '';
  const ownerName = agent.owner_first_name || '';

  let meta = '';
  let metaVariant: 'default' | 'secondary' | 'outline' = 'outline';
  if (agent._isBuiltIn) {
    meta = 'System-Agent';
    metaVariant = 'default';
  } else if (agent._isOwn) {
    meta = agent.is_public ? 'Eigener Agent · Öffentlich' : 'Eigener Agent';
    metaVariant = 'secondary';
  } else if (agent._isSaved) {
    meta = ownerName ? `Gespeichert · von ${ownerName}` : 'Gespeichert';
    metaVariant = 'secondary';
  } else if (ownerName) {
    meta = `von ${ownerName}`;
  }

  const handleUse = useCallback(() => {
    if (agent._isBuiltIn) {
      window.location.href = `/chat?agent=${agent.identifier}`;
    } else if (agent.slug) {
      window.location.href = `/agent/${agent.slug}`;
    }
  }, [agent]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0">
        <DialogHeader className="px-lg py-md border-b border-grey-200 dark:border-grey-700">
          <DialogTitle>
            {agent._isBuiltIn && agent.avatar ? `${agent.avatar} ` : ''}
            {agent.name || agent.title || 'Agent'}
          </DialogTitle>
        </DialogHeader>

        <div className="p-lg flex flex-col gap-md">
          {meta && (
            <Badge variant={metaVariant} className="w-fit">
              {meta}
            </Badge>
          )}

          {agent.description && !agent._isBuiltIn && (
            <p className="m-0 text-foreground text-sm leading-relaxed">
              {String(agent.description)}
            </p>
          )}

          <pre className={cn(
            'whitespace-pre-wrap break-words bg-background-alt border border-grey-200 dark:border-grey-700 rounded-md p-md',
            'text-sm leading-relaxed text-foreground max-h-[50vh] overflow-auto m-0',
          )}>
            {agent._isBuiltIn
              ? (String(agent.description || 'Kein Prompt verfügbar'))
              : (String(promptText || 'Kein Prompt verfügbar'))}
          </pre>
        </div>

        <DialogFooter className="px-lg py-md border-t border-grey-200 dark:border-grey-700">
          <Button onClick={handleUse}>
            Agent verwenden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AgentPreviewModal;
