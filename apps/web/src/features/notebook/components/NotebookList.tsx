import { motion } from 'motion/react';
import React, { useState } from 'react';
import { HiOutlineTrash, HiPencil, HiShare, HiEye } from 'react-icons/hi';

import IndexCard from '../../../components/common/IndexCard';
import KebabMenu from '../../../components/common/KebabMenu';
import { NotebookIcon } from '../../../config/icons';

import type { KebabMenuItem } from '../../../components/common/KebabMenu';
import type { NotebookListProps } from '../../../types/notebook';
import '../../../assets/styles/components/gallery-layout.css';
import '../styles/notebook-creator.css';

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
      <div className="qa-list-loading">
        <div className="loading-spinner" />
        <p>Notebooks werden geladen...</p>
      </div>
    );
  }

  if (qaCollections.length === 0) {
    return (
      <div className="knowledge-empty-state centered">
        <NotebookIcon size={48} className="empty-state-icon" />
        <p>Sie haben noch keine Notebooks erstellt.</p>
        <p className="empty-state-description">
          Klicken Sie auf "Notebook erstellen", um ein neues Notebook basierend auf Ihren Dokumenten
          zu erstellen.
        </p>
      </div>
    );
  }

  const buildMenuItems = (collection: { id: string; name: string }): KebabMenuItem[] => [
    { label: 'Öffnen', icon: <HiEye />, onClick: () => onView(collection.id) },
    { label: 'Bearbeiten', icon: <HiPencil />, onClick: () => onEdit(collection.id) },
    { label: 'Teilen', icon: <HiShare />, onClick: () => onShare(collection.id) },
    {
      label: deletingId === collection.id ? 'Wird gelöscht…' : 'Löschen',
      icon: <HiOutlineTrash />,
      onClick: () => handleDelete(collection.id, collection.name),
      danger: true,
    },
  ];

  return (
    <div className="gallery-grid">
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
              headerActions={<KebabMenu items={buildMenuItems(collection)} />}
            />
          </motion.div>
        );
      })}
    </div>
  );
};

export default NotebookList;
