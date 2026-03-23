'use client';

import { memo, useState } from 'react';
import {
  BookOpen,
  Check,
  FileSearch,
  Library,
  Paperclip,
  PlusIcon,
  Upload,
  Wand2,
  Zap,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@gruenerator/ui';
import { composerToolbarButtonClass } from '../../lib/utils';
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

interface PlusMenuProps {
  onInsertMention: (mentionable: Mentionable) => void;
  onOpenFileBrowser: () => void;
  onUploadFile: () => void;
}

export const PlusMenu = memo(function PlusMenu({
  onInsertMention,
  onOpenFileBrowser,
  onUploadFile,
}: PlusMenuProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const customAgents = getCustomAgentMentionables();
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const quickSkills = agentMentionables.filter(
    (a) => a.isSystemDefault || favorites.includes(a.mention.toLowerCase())
  );
  const allQuickSkills = [...quickSkills, ...customAgents];
  const selectedNotebookId = useAgentStore((s) => s.selectedNotebookId);
  const setSelectedNotebook = useAgentStore((s) => s.setSelectedNotebook);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={composerToolbarButtonClass}>
            <PlusIcon className="h-5 w-5 stroke-[1.5px]" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" className="w-48">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Wand2 className="h-3.5 w-3.5" />
              Skills
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
              {allQuickSkills.map((skill) => (
                <DropdownMenuItem key={skill.mention} onClick={() => onInsertMention(skill)}>
                  <span className="text-base leading-none">{skill.avatar}</span>
                  {skill.title}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLibraryOpen(true)}>
                <Library className="h-3.5 w-3.5" />
                Alle Skills durchsuchen...
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <BookOpen className="h-3.5 w-3.5" />
              Quellen
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
              {notebookMentionables.map((notebook) => {
                const NbIcon = notebook.icon ?? BookOpen;
                return (
                  <DropdownMenuItem
                    key={notebook.identifier}
                    onClick={() => setSelectedNotebook(notebook.identifier)}
                  >
                    <NbIcon className="h-3.5 w-3.5" />
                    <span className="flex-1">{notebook.title}</span>
                    {selectedNotebookId === notebook.identifier && (
                      <Check className="h-3.5 w-3.5 text-primary-500" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Zap className="h-3.5 w-3.5" />
              Funktionen
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {toolMentionables.map((tool) => (
                <DropdownMenuItem key={tool.identifier} onClick={() => onInsertMention(tool)}>
                  <span className="text-base leading-none">{tool.avatar}</span>
                  {tool.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Paperclip className="h-3.5 w-3.5" />
              Dateien
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={onUploadFile}>
                <Upload className="h-3.5 w-3.5" />
                Datei hochladen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenFileBrowser}>
                <FileSearch className="h-3.5 w-3.5" />
                Dokument referenzieren
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

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
});
