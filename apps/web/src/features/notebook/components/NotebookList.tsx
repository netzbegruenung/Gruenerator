import { motion } from 'motion/react';
import React, { useState } from 'react';
import { HiDotsVertical, HiOutlineTrash, HiPencil, HiShare, HiEye } from 'react-icons/hi';

import IndexCard from '../../../components/common/IndexCard';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { NotebookIcon } from '../../../config/icons';

import type { NotebookListProps } from '../../../types/notebook';

const gridClasses = 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2xl';

const NotebookList: React.FC<NotebookListProps> = ({
  qaCollections = [],
  onEdit,
  onDelete,
  onShare,
  onView,
  loading = false,
  processingCollectionIds = new Set(),
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
        <NotebookIcon size={48} className="text-grey-400 dark:text-grey-500 mb-md" />
        <p className="text-foreground">Sie haben noch keine Notebooks erstellt.</p>
        <p className="text-sm text-grey-500 dark:text-grey-400 mt-xs">
          Klicken Sie auf "Notebook erstellen", um ein neues Notebook basierend auf Ihren Dokumenten
          zu erstellen.
        </p>
      </div>
    );
  }

  return (
    <div className={gridClasses}>
      {qaCollections.map((collection) => {
        const tags: string[] = [];
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
              headerActions={
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
                    <DropdownMenuItem onClick={() => onShare(collection.id)}>
                      <HiShare />
                      Teilen
                    </DropdownMenuItem>
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
              }
            />
          </motion.div>
        );
      })}
    </div>
  );
};

export default NotebookList;
