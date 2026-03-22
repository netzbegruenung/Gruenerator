import { CardGrid, SectionHeader } from '@gruenerator/ui';
import { memo, useState, useCallback } from 'react';
import { HiOutlineTrash, HiPencil } from 'react-icons/hi';

import { getLinkIcon } from '../config/linkIcons';

import GroupLinkDialog from './GroupLinkDialog';

import type { GroupLink } from '../hooks/useGroups';

interface GroupLinksSectionProps {
  links: GroupLink[];
  isAdmin: boolean;
  onUpdateLink: (data: Omit<GroupLink, 'id'> & { linkId: string }) => void;
  onDeleteLink: (linkId: string) => void;
  isUpdatingLink: boolean;
}

const GroupLinksSection = memo(
  ({ links, isAdmin, onUpdateLink, onDeleteLink, isUpdatingLink }: GroupLinksSectionProps) => {
    const [editingLink, setEditingLink] = useState<GroupLink | null>(null);

    const handleSaveEdit = useCallback(
      (link: Omit<GroupLink, 'id'>) => {
        if (!editingLink) return;
        onUpdateLink({ linkId: editingLink.id, ...link });
        setEditingLink(null);
      },
      [editingLink, onUpdateLink]
    );

    if (links.length === 0) return null;

    return (
      <div>
        <SectionHeader size="sm" title="Links" />
        <CardGrid columns="3">
          {links.map((link) => {
            const IconComponent = getLinkIcon(link.icon);
            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-sm rounded-md border border-grey-200 dark:border-grey-700 bg-background p-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600 no-underline"
              >
                <div className="flex items-center justify-center size-9 rounded-md bg-primary-50 dark:bg-primary-950/20 shrink-0">
                  <IconComponent className="size-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate m-0">{link.title}</p>
                  {link.description && (
                    <p className="text-xs text-grey-500 truncate mt-xxs m-0">{link.description}</p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-xxs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setEditingLink(link);
                      }}
                      className="p-1 text-grey-400 hover:text-primary-500 transition-colors bg-transparent border-none cursor-pointer rounded"
                      aria-label="Link bearbeiten"
                    >
                      <HiPencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onDeleteLink(link.id);
                      }}
                      className="p-1 text-grey-400 hover:text-red-500 transition-colors bg-transparent border-none cursor-pointer rounded"
                      aria-label="Link löschen"
                    >
                      <HiOutlineTrash size={14} />
                    </button>
                  </div>
                )}
              </a>
            );
          })}
        </CardGrid>

        {isAdmin && (
          <GroupLinkDialog
            isOpen={editingLink != null}
            onClose={() => setEditingLink(null)}
            onSave={handleSaveEdit}
            isSaving={isUpdatingLink}
            link={editingLink}
          />
        )}
      </div>
    );
  }
);

GroupLinksSection.displayName = 'GroupLinksSection';

export default GroupLinksSection;
