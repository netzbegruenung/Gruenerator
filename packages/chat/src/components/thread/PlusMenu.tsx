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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const customAgents = getCustomAgentMentionables();
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const quickSkills = agentMentionables.filter(
    (a) => a.isSystemDefault || favorites.includes(a.mention.toLowerCase())
  );
  const allQuickSkills = [...quickSkills, ...customAgents];
  const selectedNotebookId = useAgentStore((s) => s.selectedNotebookId);
  const setSelectedNotebook = useAgentStore((s) => s.setSelectedNotebook);

  const handleMobileAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  const desktopContent = (
    <>
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
    </>
  );

  const mobileContent = (
    <>
      <ResponsiveMenuSection title="Dateien">
        <ResponsiveMenuItem icon={<Upload />} onClick={() => handleMobileAction(onUploadFile)}>
          Datei hochladen
        </ResponsiveMenuItem>
        <ResponsiveMenuItem
          icon={<FileSearch />}
          onClick={() => handleMobileAction(onOpenFileBrowser)}
        >
          Dokument referenzieren
        </ResponsiveMenuItem>
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Skills">
        {allQuickSkills.map((skill) => (
          <ResponsiveMenuItem
            key={skill.mention}
            icon={<span className="text-base leading-none">{skill.avatar}</span>}
            onClick={() => handleMobileAction(() => onInsertMention(skill))}
          >
            {skill.title}
          </ResponsiveMenuItem>
        ))}
        <ResponsiveMenuItem
          icon={<Library />}
          onClick={() => {
            setMenuOpen(false);
            setLibraryOpen(true);
          }}
        >
          Alle Skills durchsuchen...
        </ResponsiveMenuItem>
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Quellen">
        {notebookMentionables.map((notebook) => {
          const NbIcon = notebook.icon ?? BookOpen;
          return (
            <ResponsiveMenuItem
              key={notebook.identifier}
              icon={<NbIcon />}
              active={selectedNotebookId === notebook.identifier}
              onClick={() => setSelectedNotebook(notebook.identifier)}
            >
              {notebook.title}
            </ResponsiveMenuItem>
          );
        })}
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Funktionen">
        {toolMentionables.map((tool) => (
          <ResponsiveMenuItem
            key={tool.identifier}
            icon={<span className="text-base leading-none">{tool.avatar}</span>}
            onClick={() => handleMobileAction(() => onInsertMention(tool))}
          >
            {tool.title}
          </ResponsiveMenuItem>
        ))}
      </ResponsiveMenuSection>
    </>
  );

  return (
    <>
      <ResponsiveMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        sheetTitle="Aktionen"
        trigger={
          <button type="button" className={composerToolbarButtonClass}>
            <PlusIcon className="h-5 w-5 stroke-[1.5px]" />
          </button>
        }
        desktopContent={desktopContent}
        mobileContent={mobileContent}
      />

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
