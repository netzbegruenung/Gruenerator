'use client';

import { useState } from 'react';
import { useAgentStore } from '@/lib/store';
import { agentsList } from '@/lib/agents';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';

export function AgentSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedAgentId, setSelectedAgent, setCurrentThread } = useAgentStore();

  const selectedAgent = agentsList.find((a) => a.identifier === selectedAgentId);

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgent(agentId);
    setCurrentThread(null); // Start fresh with new agent
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium text-foreground-muted">
        Assistent
      </label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-primary"
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg"
            style={{ backgroundColor: selectedAgent?.backgroundColor || '#316049' }}
          >
            {selectedAgent?.avatar}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selectedAgent?.title}</p>
            <p className="truncate text-xs text-foreground-muted">
              {selectedAgent?.description}
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-5 w-5 flex-shrink-0 text-foreground-muted transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-background shadow-lg scrollbar-thin">
            {agentsList.map((agent) => (
              <button
                key={agent.identifier}
                onClick={() => handleSelectAgent(agent.identifier)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-primary/5',
                  agent.identifier === selectedAgentId && 'bg-primary/10'
                )}
              >
                <span
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-lg"
                  style={{ backgroundColor: agent.backgroundColor }}
                >
                  {agent.avatar}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{agent.title}</p>
                  <p className="truncate text-xs text-foreground-muted">
                    {agent.description}
                  </p>
                </div>
                {agent.identifier === selectedAgentId && (
                  <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
