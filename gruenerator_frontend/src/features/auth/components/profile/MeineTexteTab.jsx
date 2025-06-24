import React, { useState, useEffect, useCallback } from 'react';
import { motion } from "motion/react";
import DocumentOverview from '../../../../components/common/DocumentOverview';
import { useOptimizedAuth } from '../../../../hooks/useAuth';

const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

const MeineTexteTab = ({ isActive, onSuccessMessage, onErrorMessage }) => {
    const { user, isAuthenticated } = useOptimizedAuth();
    
    // State management
    const [texts, setTexts] = useState([]);

    // Document type options
    const documentTypes = {
        'text': 'Allgemeiner Text',
        'antrag': 'Antrag',
        'social': 'Social Media',
        'universal': 'Universeller Text',
        'press': 'Pressemitteilung',
        'gruene_jugend': 'Gruene Jugend'
    };

    // Fetch user texts
    const fetchTexts = useCallback(async () => {
        if (!isAuthenticated || !user?.id) return;

        try {
            const response = await fetch(`${AUTH_BASE_URL}/api/user-texts`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                setTexts(data.data || []);
            } else {
                throw new Error(data.message || 'Failed to fetch texts');
            }
        } catch (error) {
            console.error('[MeineTexteTab] Error fetching texts:', error);
            onErrorMessage('Fehler beim Laden der Texte: ' + error.message);
        }
    }, [isAuthenticated, user?.id, onErrorMessage]);

    // Initial load
    useEffect(() => {
        if (isActive) {
            fetchTexts();
        }
    }, [isActive, fetchTexts]);

    // Update document title
    const updateTitle = async (documentId, newTitleValue) => {
        const response = await fetch(`${AUTH_BASE_URL}/api/user-texts/${documentId}/metadata`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title: newTitleValue.trim() }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
            // Update local state
            setTexts(prev => prev.map(text => 
                text.id === documentId 
                    ? { ...text, title: newTitleValue.trim() }
                    : text
            ));
        } else {
            throw new Error(data.message || 'Failed to update title');
        }
    };

    // Delete document
    const deleteDocument = async (documentId) => {
        const response = await fetch(`${AUTH_BASE_URL}/api/user-texts/${documentId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
            setTexts(prev => prev.filter(text => text.id !== documentId));
        } else {
            throw new Error(data.message || 'Failed to delete document');
        }
    };

    // Open document in collaborative editor
    const openInEditor = (documentId) => {
        window.open(`/editor/collab/${documentId}`, '_blank');
    };

    // Document action handlers
    const handleEditDocument = (document) => {
        openInEditor(document.id);
    };

    return (
        <motion.div 
            className="profile-content profile-full-width-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="profile-form-section">
                <DocumentOverview
                    documents={texts}
                    loading={false}
                    onFetch={fetchTexts}
                    onDelete={deleteDocument}
                    onUpdateTitle={updateTitle}
                    onEdit={handleEditDocument}
                    documentTypes={documentTypes}
                    emptyStateConfig={{
                        noDocuments: 'Du hast noch keine Texte erstellt.',
                        createMessage: 'Erstelle deinen ersten Text mit einem der Grueneratoren und er wird hier angezeigt.'
                    }}
                    searchPlaceholder="Texte durchsuchen..."
                    title="Meine Texte"
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                />
            </div>
        </motion.div>
    );
};

export default MeineTexteTab;