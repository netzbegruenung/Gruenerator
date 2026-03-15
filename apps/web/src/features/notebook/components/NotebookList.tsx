import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { motion } from 'motion/react';
import React, { useState } from 'react';
import {
  HiDotsVertical,
  HiOutlineTrash,
  HiPencil,
  HiShare,
  HiEye,
  HiUserGroup,
} from 'react-icons/hi';

import IndexCard from '../../../components/common/IndexCard';
import { NotebookIcon } from '../../../config/icons';

import type { NotebookListProps } from '../../../types/notebook';

const gridClasses = 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2xl';
const compactGridClasses =
  'grid grid-cols-5 max-lg:grid-cols-4 max-md:grid-cols-3 max-sm:grid-cols-2 gap-sm';

const NotebookList: React.FC<NotebookListProps> = ({
  qaCollections = [],
  onEdit,
  onDelete,
  onShare,
  onView,
  onShareToGroup,
  loading = false,
  processingCollectionIds = new Set(),
  compact = false,
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string): Promise<void> => {
    if (window.confirm(`Möchten Sie das Notebook "${name}" wirklich löschen?`)) {
      setDeletingId(id);
      try {
        await onDelete(id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center py-xl">
        <div className="size-6 animate-spin rounded-full border-3 border-grey-200 border-t-primary-500" />
        <p className="mt-md text-foreground">Notebooks werden geladen...</p>
      </div>
    );
  }

  if (qaCollections.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-xl">
        <NotebookIcon size={compact ? 32 : 48} className="text-grey-400 dark:text-grey-500 mb-md" />
        <p className="text-foreground">Noch keine eigenen Notebooks erstellt.</p>
      </div>
    );
  }

  const kebabMenu = (collection: (typeof qaCollections)[0]) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => e.stopPropagation()}
          aria-label="Aktionen"
        >
          <HiDotsVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onView(collection.id)}>
          <HiEye />
          Öffnen
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(collection.id)}>
          <HiPencil />
          Bearbeiten
        </DropdownMenuItem>
        {onShareToGroup ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HiShare />
              Teilen
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => onShare(collection.id)}>
                <HiShare />
                Link kopieren
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onShareToGroup(collection.id, collection.name)}>
                <HiUserGroup />
                Mit Gruppe teilen
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem onClick={() => onShare(collection.id)}>
            <HiShare />
            Teilen
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => handleDelete(collection.id, collection.name)}
        >
          <HiOutlineTrash />
          {deletingId === collection.id ? 'Wird gelöscht…' : 'Löschen'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (compact) {
    return (
      <div className={compactGridClasses}>
        {qaCollections.map((collection) => (
          <div
            key={collection.id}
            role="button"
            tabIndex={0}
            className="group flex items-center gap-sm bg-background border border-grey-200 dark:border-grey-700 rounded-md px-md py-sm cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
            onClick={() => onView(collection.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onView(collection.id);
              }
            }}
          >
            <NotebookIcon className="text-base text-secondary-600 shrink-0" />
            <span className="text-sm font-medium text-foreground-heading truncate flex-1">
              {collection.name}
            </span>
            <div
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              {kebabMenu(collection)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={gridClasses}>
      {qaCollections.map((collection) => {
        const tags: string[] = [...(collection.labels || [])];
        if (collection.is_public) tags.push('Öffentlich');
        if (processingCollectionIds.has(collection.id)) tags.push('Wird verarbeitet…');

        const docCount = collection.document_count || 0;
        const meta = (
          <span>
            {docCount} Dokument{docCount !== 1 ? 'e' : ''} &middot;{' '}
            {new Date(collection.created_at).toLocaleDateString('de-DE')}
          </span>
        );

        return (
          <motion.div
            key={collection.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <IndexCard
              title={collection.name}
              description={collection.description}
              meta={meta}
              tags={tags}
              onClick={() => onView(collection.id)}
              headerActions={kebabMenu(collection)}
            />
          </motion.div>
        );
      })}
    </div>
  );
};

export default NotebookList;
