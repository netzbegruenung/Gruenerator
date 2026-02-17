'use client';

import { useState } from 'react';
import { PlusIcon, Upload, FileSearch, ChevronRight, ArrowLeft, Check } from 'lucide-react';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { useAgentStore } from '../../stores/chatStore';
import {
  agentMentionables,
  getCustomAgentMentionables,
  toolMentionables,
  notebookMentionables,
  type Mentionable,
} from '../../lib/mentionables';

type MenuView = 'main' | 'skills' | 'quellen';

interface PlusMenuProps {
  onInsertMention: (mentionable: Mentionable) => void;
  onOpenFileBrowser: () => void;
  onUploadFile: () => void;
}

export function PlusMenu({ onInsertMention, onOpenFileBrowser, onUploadFile }: PlusMenuProps) {
  const [view, setView] = useState<MenuView>('main');
  const customAgents = getCustomAgentMentionables();
  const allSkills = [...agentMentionables, ...customAgents];
  const selectedNotebookId = useAgentStore((s) => s.selectedNotebookId);
  const setSelectedNotebook = useAgentStore((s) => s.setSelectedNotebook);
  const selectedNotebook = notebookMentionables.find((n) => n.identifier === selectedNotebookId);

  const handleOpenChange = (open: boolean) => {
    if (!open) setView('main');
  };

  return (
    <Dropdown
      trigger={<PlusIcon className="h-5 w-5 stroke-[1.5px]" />}
      direction="up"
      align="left"
      width="w-80"
      maxHeight="24rem"
      showChevron={false}
      onOpenChange={handleOpenChange}
    >
      {view === 'main' && (
        <>
          {/* Skills → submenu */}
          <DropdownItem
            icon={<span className="text-base">🎯</span>}
            label="Skills"
            description={`${allSkills.length} Assistenten`}
            onClick={() => setView('skills')}
            trailing={<ChevronRight className="h-4 w-4 text-foreground-muted" />}
          />

          {/* Divider */}
          <div className="my-1 border-t border-border" />

          {/* Functions section — compact inline */}
          <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
            Funktionen
          </div>
          {toolMentionables.map((tool) => (
            <button
              key={tool.identifier}
              onClick={() => onInsertMention(tool)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-hover-overlay"
            >
              <span className="flex h-5 w-5 items-center justify-center text-sm">
                {tool.avatar}
              </span>
              <span className="text-foreground">{tool.title}</span>
            </button>
          ))}

          {/* Divider */}
          <div className="my-1 border-t border-border" />

          {/* Quellen → submenu */}
          <DropdownItem
            icon={<span className="text-base">📚</span>}
            label="Quellen"
            description={selectedNotebook?.title || 'Alle Quellen'}
            onClick={() => setView('quellen')}
            trailing={<ChevronRight className="h-4 w-4 text-foreground-muted" />}
          />

          {/* Divider */}
          <div className="my-1 border-t border-border" />

          {/* File actions */}
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

      {view === 'skills' && (
        <>
          <button
            onClick={() => setView('main')}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-hover-overlay rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Skills
          </button>
          <div className="my-1 border-t border-border" />
          {allSkills.map((agent) => (
            <button
              key={agent.identifier}
              onClick={() => onInsertMention(agent)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-hover-overlay"
            >
              <span className="flex h-5 w-5 items-center justify-center text-sm">
                {agent.avatar}
              </span>
              <span className="text-foreground">{agent.title}</span>
            </button>
          ))}
        </>
      )}

      {view === 'quellen' && (
        <>
          <button
            onClick={() => setView('main')}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-hover-overlay rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Quellen
          </button>
          <div className="my-1 border-t border-border" />
          {notebookMentionables.map((notebook) => (
            <button
              key={notebook.identifier}
              onClick={() => setSelectedNotebook(notebook.identifier)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-hover-overlay"
            >
              <span className="flex h-5 w-5 items-center justify-center text-sm">
                {notebook.avatar}
              </span>
              <span className="flex-1 text-foreground">{notebook.title}</span>
              {selectedNotebookId === notebook.identifier && (
                <Check className="h-4 w-4 text-primary-500" />
              )}
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}
