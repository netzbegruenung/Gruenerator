'use client';

import { useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  FileSearch,
  Library,
  Paperclip,
  PlusIcon,
  Upload,
  Wand2,
  Zap,
} from 'lucide-react';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { useAgentStore } from '../../stores/chatStore';
import { useSkillFavoritesStore } from '../../stores/skillFavoritesStore';
import {
  agentMentionables,
  getCustomAgentMentionables,
  toolMentionables,
  notebookMentionables,
  type Mentionable,
} from '../../lib/mentionables';
import { SkillLibraryModal } from '../skills/SkillLibraryModal';

type Submenu = 'skills' | 'quellen' | 'funktionen' | 'dateien';

interface PlusMenuProps {
  onInsertMention: (mentionable: Mentionable) => void;
  onOpenFileBrowser: () => void;
  onUploadFile: () => void;
}

export function PlusMenu({ onInsertMention, onOpenFileBrowser, onUploadFile }: PlusMenuProps) {
  const [expandedSubmenu, setExpandedSubmenu] = useState<Submenu | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const customAgents = getCustomAgentMentionables();
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const quickSkills = agentMentionables.filter(
    (a) => a.isSystemDefault || favorites.includes(a.mention.toLowerCase())
  );
  const allQuickSkills = [...quickSkills, ...customAgents];
  const selectedNotebookId = useAgentStore((s) => s.selectedNotebookId);
  const setSelectedNotebook = useAgentStore((s) => s.setSelectedNotebook);

  const handleOpenChange = (open: boolean) => {
    if (!open) setExpandedSubmenu(null);
  };

  const toggleSubmenu = (menu: Submenu) => {
    setExpandedSubmenu((prev) => (prev === menu ? null : menu));
  };

  return (
    <>
      <Dropdown
        trigger={<PlusIcon className="h-5 w-5 stroke-[1.5px]" />}
        direction="up"
        align="left"
        width="w-80"
        showChevron={false}
        onOpenChange={handleOpenChange}
        containerClassName="overflow-visible"
      >
        <div className="relative">
          <DropdownItem
            icon={<Wand2 className="h-4 w-4 text-foreground-muted" />}
            label="Skills"
            selected={expandedSubmenu === 'skills'}
            onClick={() => toggleSubmenu('skills')}
            trailing={<ChevronRight className="h-4 w-4 text-foreground-muted" />}
          />
          <DropdownItem
            icon={<BookOpen className="h-4 w-4 text-foreground-muted" />}
            label="Quellen"
            selected={expandedSubmenu === 'quellen'}
            onClick={() => toggleSubmenu('quellen')}
            trailing={<ChevronRight className="h-4 w-4 text-foreground-muted" />}
          />
          <DropdownItem
            icon={<Zap className="h-4 w-4 text-foreground-muted" />}
            label="Funktionen"
            selected={expandedSubmenu === 'funktionen'}
            onClick={() => toggleSubmenu('funktionen')}
            trailing={<ChevronRight className="h-4 w-4 text-foreground-muted" />}
          />
          <DropdownItem
            icon={<Paperclip className="h-4 w-4 text-foreground-muted" />}
            label="Dateien"
            selected={expandedSubmenu === 'dateien'}
            onClick={() => toggleSubmenu('dateien')}
            trailing={<ChevronRight className="h-4 w-4 text-foreground-muted" />}
          />

          {expandedSubmenu && (
            <div className="absolute left-full bottom-0 ml-1 w-72 rounded-xl border border-border bg-background p-1 shadow-lg max-h-[24rem] overflow-y-auto">
              {expandedSubmenu === 'skills' && (
                <>
                  {allQuickSkills.map((skill) => (
                    <DropdownItem
                      key={skill.mention}
                      icon={<span className="text-base">{skill.avatar}</span>}
                      label={skill.title}
                      onClick={() => onInsertMention(skill)}
                    />
                  ))}
                  <div className="border-t border-border mt-1 pt-1">
                    <DropdownItem
                      icon={<Library className="h-4 w-4 text-foreground-muted" />}
                      label="Alle Skills durchsuchen..."
                      onClick={() => setLibraryOpen(true)}
                    />
                  </div>
                </>
              )}
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
      <SkillLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(m) => {
          onInsertMention(m);
          setLibraryOpen(false);
        }}
      />
    </>
  );
}
