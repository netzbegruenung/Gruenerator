'use client';

import { memo, useState } from 'react';
import {
  BookOpen,
  ExternalLink,
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
import { useChatDensity } from './chatDensityContext';
import { useSkillFavoritesStore } from '../../stores/skillFavoritesStore';
import {
  getAgentMentionables,
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
  onOpenSkillsPage?: () => void;
}

export const PlusMenu = memo(function PlusMenu({
  onInsertMention,
  onOpenFileBrowser,
  onUploadFile,
  onOpenSkillsPage,
}: PlusMenuProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isCompact = useChatDensity() === 'compact';
  const customAgents = getCustomAgentMentionables();
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const quickSkills = getAgentMentionables().filter(
    (a) => a.isSystemDefault || favorites.includes(a.mention.toLowerCase())
  );
  const allQuickSkills = [...quickSkills, ...customAgents];

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
          {allQuickSkills.map((skill) => {
            const Icon = skill.icon;
            return (
              <DropdownMenuItem key={skill.mention} onClick={() => onInsertMention(skill)}>
                {Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null}
                {skill.title}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setLibraryOpen(true)}>
            <Library className="h-3.5 w-3.5" />
            Alle Skills durchsuchen...
          </DropdownMenuItem>
          {onOpenSkillsPage && (
            <DropdownMenuItem onClick={onOpenSkillsPage}>
              <ExternalLink className="h-3.5 w-3.5" />
              Zur Skill-Bibliothek
            </DropdownMenuItem>
          )}
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
              <DropdownMenuItem key={notebook.identifier} onClick={() => onInsertMention(notebook)}>
                <NbIcon className="h-3.5 w-3.5" />
                <span className="flex-1">{notebook.title}</span>
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
          {toolMentionables.map((tool) => {
            const Icon = tool.icon;
            return (
              <DropdownMenuItem key={tool.identifier} onClick={() => onInsertMention(tool)}>
                {Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null}
                {tool.title}
              </DropdownMenuItem>
            );
          })}
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
            Dokument
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
          Dokument
        </ResponsiveMenuItem>
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Skills">
        {allQuickSkills.map((skill) => {
          const Icon = skill.icon;
          return (
            <ResponsiveMenuItem
              key={skill.mention}
              icon={Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null}
              onClick={() => handleMobileAction(() => onInsertMention(skill))}
            >
              {skill.title}
            </ResponsiveMenuItem>
          );
        })}
        <ResponsiveMenuItem
          icon={<Library />}
          onClick={() => {
            setMenuOpen(false);
            setLibraryOpen(true);
          }}
        >
          Alle Skills durchsuchen...
        </ResponsiveMenuItem>
        {onOpenSkillsPage && (
          <ResponsiveMenuItem
            icon={<ExternalLink />}
            onClick={() => {
              setMenuOpen(false);
              onOpenSkillsPage();
            }}
          >
            Zur Skill-Bibliothek
          </ResponsiveMenuItem>
        )}
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Quellen">
        {notebookMentionables.map((notebook) => {
          const NbIcon = notebook.icon ?? BookOpen;
          return (
            <ResponsiveMenuItem
              key={notebook.identifier}
              icon={<NbIcon />}
              onClick={() => handleMobileAction(() => onInsertMention(notebook))}
            >
              {notebook.title}
            </ResponsiveMenuItem>
          );
        })}
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Funktionen">
        {toolMentionables.map((tool) => {
          const Icon = tool.icon;
          return (
            <ResponsiveMenuItem
              key={tool.identifier}
              icon={Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null}
              onClick={() => handleMobileAction(() => onInsertMention(tool))}
            >
              {tool.title}
            </ResponsiveMenuItem>
          );
        })}
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
          <button type="button" className={composerToolbarButtonClass(isCompact)}>
            <PlusIcon className={isCompact ? 'h-4 w-4 stroke-[1.5px]' : 'h-5 w-5 stroke-[1.5px]'} />
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
