import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import React from 'react';
import {
  HiDotsVertical,
  HiOutlineDocumentText,
  HiOutlineTrash,
  HiPencil,
  HiShare,
  HiUserGroup,
} from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { type GroupSummary } from '../../groups/hooks/useGroups';

const TEXT_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  antrag: 'Antrag',
  social: 'Social',
  press: 'Presse',
  universal: 'Universal',
  gruene_jugend: 'Grüne Jugend',
};

const TextCard = React.memo(
  ({
    text,
    groups,
    onDelete,
    onShareToGroup,
    sharedId,
  }: {
    text: { id: string | number; title: string; document_type?: string; content?: string };
    groups: GroupSummary[];
    onDelete: (id: string | number, title: string) => void;
    onShareToGroup: (textId: string | number, groupId: string) => void;
    sharedId: string | number | null;
  }) => {
    const navigate = useNavigate();
    const label = TEXT_TYPE_LABELS[text.document_type ?? ''];

    return (
      <div
        role="button"
        tabIndex={0}
        className="group flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600"
        onClick={() => navigate(`/texte/texteditor?textId=${text.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/texte/texteditor?textId=${text.id}`);
          }
        }}
      >
        <div className="relative bg-white dark:bg-grey-800 aspect-[4/3] overflow-hidden">
          {text.content ? (
            <div className="w-[600px] origin-top-left scale-[0.25] p-8 pointer-events-none select-none text-foreground font-sans leading-relaxed">
              <p className="text-base whitespace-pre-line">
                {text.content.replace(/<[^>]*>/g, '').slice(0, 500)}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-4xl select-none">📝</div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white dark:to-grey-800 pointer-events-none" />
        </div>
        <div className="border-t border-grey-100 dark:border-grey-700 px-sm py-sm">
          <div className="flex items-center gap-xs min-w-0">
            <HiOutlineDocumentText className="text-sm text-secondary-600 shrink-0" />
            <span className="text-sm font-medium text-foreground-heading truncate flex-1">
              {text.title || 'Ohne Titel'}
            </span>
            <div
              className="shrink-0 max-sm:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center justify-center w-6 h-6 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Aktionen"
                  >
                    <HiDotsVertical size={14} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/texte/texteditor?textId=${text.id}`)}>
                    <HiPencil />
                    Bearbeiten
                  </DropdownMenuItem>
                  {groups.length > 0 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HiShare />
                        {sharedId === text.id ? 'Geteilt!' : 'Teilen'}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {groups.map((group) => (
                          <DropdownMenuItem
                            key={group.id}
                            onClick={() => onShareToGroup(text.id, group.id)}
                          >
                            <HiUserGroup />
                            {group.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(text.id, text.title)}
                  >
                    <HiOutlineTrash />
                    Löschen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {label && <p className="text-xs text-grey-400 mt-0.5 m-0">{label}</p>}
        </div>
      </div>
    );
  }
);

TextCard.displayName = 'TextCard';

export default TextCard;
