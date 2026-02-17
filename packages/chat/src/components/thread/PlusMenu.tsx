'use client';

import { useState } from 'react';
import { PlusIcon, Upload, FileSearch, ChevronRight, Check } from 'lucide-react';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { useAgentStore } from '../../stores/chatStore';
import {
  agentMentionables,
  getCustomAgentMentionables,
  toolMentionables,
  notebookMentionables,
  type Mentionable,
} from '../../lib/mentionables';

type Submenu = 'skills' | 'quellen' | 'funktionen' | 'dateien';

interface PlusMenuProps {
  onInsertMention: (mentionable: Mentionable) => void;
  onOpenFileBrowser: () => void;
  onUploadFile: () => void;
}

export function PlusMenu({ onInsertMention, onOpenFileBrowser, onUploadFile }: PlusMenuProps) {
  const [expandedSubmenu, setExpandedSubmenu] = useState<Submenu | null>(null);
  const customAgents = getCustomAgentMentionables();
  const allSkills = [...agentMentionables, ...customAgents];
  const selectedNotebookId = useAgentStore((s) => s.selectedNotebookId);
  const setSelectedNotebook = useAgentStore((s) => s.setSelectedNotebook);

  const handleOpenChange = (open: boolean) => {
    if (!open) setExpandedSubmenu(null);
  };

  const toggleSubmenu = (menu: Submenu) => {
    setExpandedSubmenu((prev) => (prev === menu ? null : menu));
  };

  return (
    <Dropdown
      trigger={<PlusIcon className="h-5 w-5 stroke-[1.5px]" />}
      direction="up"
      align="left"
      width="min-w-80 w-fit"
      showChevron={false}
      onOpenChange={handleOpenChange}
    >
      <div className="flex">
        {/* Main menu — always visible */}
        <div className="w-80 flex-shrink-0">
          <DropdownItem
            icon={<span className="text-base">🎯</span>}
            label="Skills"
            selected={expandedSubmenu === 'skills'}
            onClick={() => toggleSubmenu('skills')}
            trailing={<ChevronRight className="h-4 w-4 text-foreground-muted" />}
          />
          <DropdownItem
            icon={<span className="text-base">📚</span>}
            label="Quellen"
            selected={expandedSubmenu === 'quellen'}
            onClick={() => toggleSubmenu('quellen')}
            trailing={<ChevronRight className="h-4 w-4 text-foreground-muted" />}
          />
          <DropdownItem
            icon={<span className="text-base">⚡</span>}
            label="Funktionen"
            selected={expandedSubmenu === 'funktionen'}
            onClick={() => toggleSubmenu('funktionen')}
            trailing={<ChevronRight className="h-4 w-4 text-foreground-muted" />}
          />
          <DropdownItem
            icon={<span className="text-base">📎</span>}
            label="Dateien"
            selected={expandedSubmenu === 'dateien'}
            onClick={() => toggleSubmenu('dateien')}
            trailing={<ChevronRight className="h-4 w-4 text-foreground-muted" />}
          />
        </div>

        {/* Submenu panel — appears alongside main menu */}
        {expandedSubmenu && (
          <div className="w-72 flex-shrink-0 border-l border-border max-h-[24rem] overflow-y-auto">
            {expandedSubmenu === 'skills' &&
              allSkills.map((agent) => (
                <DropdownItem
                  key={agent.mention}
                  icon={<span className="text-base">{agent.avatar}</span>}
                  label={agent.title}
                  onClick={() => onInsertMention(agent)}
                />
              ))}
            {expandedSubmenu === 'quellen' &&
              notebookMentionables.map((notebook) => (
                <DropdownItem
                  key={notebook.identifier}
                  icon={<span className="text-base">{notebook.avatar}</span>}
                  label={notebook.title}
                  selected={selectedNotebookId === notebook.identifier}
                  onClick={() => setSelectedNotebook(notebook.identifier)}
                  trailing={
                    selectedNotebookId === notebook.identifier ? (
                      <Check className="h-4 w-4 text-primary-500" />
                    ) : undefined
                  }
                />
              ))}
            {expandedSubmenu === 'funktionen' &&
              toolMentionables.map((tool) => (
                <DropdownItem
                  key={tool.identifier}
                  icon={<span className="text-base">{tool.avatar}</span>}
                  label={tool.title}
                  onClick={() => onInsertMention(tool)}
                />
              ))}
            {expandedSubmenu === 'dateien' && (
              <>
                <DropdownItem
                  icon={<Upload className="h-4 w-4 text-foreground-muted" />}
                  label="Datei hochladen"
                  onClick={onUploadFile}
                />
                <DropdownItem
                  icon={<FileSearch className="h-4 w-4 text-foreground-muted" />}
                  label="Dokument referenzieren"
                  onClick={onOpenFileBrowser}
                />
              </>
            )}
          </div>
        )}
      </div>
    </Dropdown>
  );
}
