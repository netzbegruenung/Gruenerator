'use client';

import { useState, useRef, useEffect } from 'react';
import { useAgentStore } from '../stores/chatStore';
import { agentsList } from '../lib/agents';
import { cn } from '../lib/utils';
import { ChevronDown, Check } from 'lucide-react';

export function AgentSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedAgentId, setSelectedAgent, setCurrentThread } = useAgentStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedAgent = agentsList.find((a) => a.identifier === selectedAgentId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgent(agentId);
    setCurrentThread(null);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="agent-pill"
        aria-label="Assistent wählen"
      >
        <span
          className="agent-pill-avatar"
          style={{ backgroundColor: selectedAgent?.backgroundColor || '#316049' }}
        >
          {selectedAgent?.avatar}
        </span>
        <span className="agent-pill-name">{selectedAgent?.title}</span>
        <ChevronDown className={cn('agent-pill-chevron', isOpen && 'open')} />
      </button>

      {isOpen && (
        <div className="agent-dropdown">
          {agentsList.map((agent) => (
            <button
              key={agent.identifier}
              onClick={() => handleSelectAgent(agent.identifier)}
              className={cn(
                'agent-dropdown-item',
                agent.identifier === selectedAgentId && 'selected'
              )}
            >
              <span
                className="agent-pill-avatar"
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
      )}
    </div>
  );
}
