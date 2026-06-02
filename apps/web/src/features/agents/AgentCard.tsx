import { type Agent, getAgentSlug } from '@gruenerator/shared/agents';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { memo, useState } from 'react';
import { PiDotsThreeVertical, PiPencilSimple, PiTrash } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { useDeleteUserAgent } from './api';
import { AgentAvatar } from './icons/AgentAvatar';

interface AgentCardProps {
  agent: Agent;
}

/**
 * Clean card for one owned agent: click to chat, kebab menu to edit or delete.
 * Mirrors the workplace `TextCard` pattern (hover-lift card + dropdown actions).
 */
const AgentCard = memo(({ agent }: AgentCardProps) => {
  const navigate = useNavigate();
  const deleteMut = useDeleteUserAgent();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const openChat = () => {
    void navigate(`/agents/${getAgentSlug(agent.identifier)}`);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openChat}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openChat();
          }
        }}
        className="group flex cursor-pointer items-start gap-sm rounded-md border border-grey-200 bg-background p-md transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-grey-300 hover:shadow-md dark:border-grey-700 dark:hover:border-grey-600"
      >
        <AgentAvatar
          iconKey={agent.iconKey}
          avatar={agent.avatar}
          backgroundColor={agent.backgroundColor}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-sm font-semibold text-foreground-heading">
            {agent.title}
          </h3>
          <p className="m-0 mt-0.5 line-clamp-2 text-xs text-foreground-muted">
            {agent.description}
          </p>
        </div>
        <div
          className="shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-sm:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Aktionen"
                className="flex h-7 w-7 items-center justify-center rounded-full text-grey-400 transition-colors hover:bg-hover-alt hover:text-foreground"
              >
                <PiDotsThreeVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/agents/${agent.identifier}/edit`)}>
                <PiPencilSimple />
                Bearbeiten
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                <PiTrash />
                Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Agent löschen?</DialogTitle>
            <DialogDescription>
              „{agent.title}“ wird dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() =>
                deleteMut.mutate(agent.identifier, { onSuccess: () => setConfirmOpen(false) })
              }
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

AgentCard.displayName = 'AgentCard';

export default AgentCard;
