import React, { useState } from 'react';
import { HiOutlineTrash, HiPencil, HiShare, HiEye } from 'react-icons/hi';
import { NotebookIcon } from '../../../config/icons';
import { motion } from "motion/react";

const QAList = ({ qaCollections = [], onEdit, onDelete, onShare, onView, loading = false }) => {
    const [deletingId, setDeletingId] = useState(null);

    const handleDelete = async (id, name) => {
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
                <div className="loading-spinner"></div>
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
                    Klicken Sie auf "Notebook erstellen", um ein neues Notebook basierend auf Ihren Dokumenten zu erstellen.
                </p>
            </div>
        );
    }

    return (
        <div className="qa-collections-list">
            {qaCollections.map((collection) => (
                <motion.div
                    key={collection.id}
                    className="qa-collection-card profile-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="profile-card-header">
                        <div className="qa-collection-info">
                            <h4>{collection.name}</h4>
                            {collection.description && (
                                <p className="qa-collection-description">{collection.description}</p>
                            )}
                            <div className="qa-collection-meta">
                                <span className="qa-document-count">
                                    {collection.document_count || 0} Dokument{collection.document_count !== 1 ? 'e' : ''}
                                </span>
                                {collection.is_public && (
                                    <span className="qa-public-badge">Öffentlich</span>
                                )}
                                <span className="qa-created-date">
                                    {new Date(collection.created_at).toLocaleDateString('de-DE')}
                                </span>
                            </div>
                        </div>
                        <div className="qa-collection-actions">
                            <button
                                className="icon-button style-as-link"
                                onClick={() => onView(collection.id)}
                                title="Notebook öffnen"
                            >
                                <HiEye />
                            </button>
                            <button
                                className="icon-button style-as-link"
                                onClick={() => onEdit(collection.id)}
                                title="Notebook bearbeiten"
                            >
                                <HiPencil />
                            </button>
                            <button
                                className="icon-button style-as-link"
                                onClick={() => onShare(collection.id)}
                                title="Notebook teilen"
                            >
                                <HiShare />
                            </button>
                            <button
                                className="icon-button danger"
                                onClick={() => handleDelete(collection.id, collection.name)}
                                disabled={deletingId === collection.id}
                                title="Notebook löschen"
                            >
                                {deletingId === collection.id ? (
                                    <div className="loading-spinner-small"></div>
                                ) : (
                                    <HiOutlineTrash />
                                )}
                            </button>
                        </div>
                    </div>
                    
                    {collection.custom_prompt && (
                        <div className="profile-card-content">
                            <div className="qa-custom-prompt">
                                <strong>Anweisungen:</strong>
                                <p>{collection.custom_prompt}</p>
                            </div>
                        </div>
                    )}
                    
                    {collection.view_count > 0 && (
                        <div className="qa-stats">
                            <span>{collection.view_count} Aufrufe</span>
                        </div>
                    )}
                </motion.div>
            ))}
        </div>
    );
};

export default QAList;