import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { HiX, HiDocumentText, HiCollection } from 'react-icons/hi';
import { profileApiService } from '../../../../../../services/profileApiService';
import { useDocumentsStore } from '../../../../../../../../stores/documentsStore';
import { ICONS } from '../../../../../../../../config/icons';
import '../../../../../../../../assets/styles/features/groups/add-content-modal.css';

const CONTENT_TABS = [
    { id: 'documents', label: 'Dokumente', icon: HiDocumentText, contentType: 'documents' },
    { id: 'texts', label: 'Texte', icon: HiDocumentText, contentType: 'user_documents' },
    { id: 'generators', label: 'Generatoren', icon: HiCollection, contentType: 'custom_generators' },
    { id: 'notebooks', label: 'Notebooks', icon: ICONS.actions.notebook, contentType: 'notebook_collections' },
    { id: 'templates', label: 'Vorlagen', icon: HiCollection, contentType: 'database' }
];

const READ_ONLY_PERMISSIONS = { read: true, write: false, collaborative: false };

const AddContentToGroupModal = ({
    isOpen,
    onClose,
    groupId,
    onShareContent,
    isSharing,
    onSuccess,
    onError,
    initialContentType
}) => {
    const [activeTab, setActiveTab] = useState('documents');
    const [selectedItems, setSelectedItems] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [content, setContent] = useState({
        documents: [],
        texts: [],
        generators: [],
        notebooks: [],
        templates: []
    });

    const { fetchDocuments, documents } = useDocumentsStore();

    useEffect(() => {
        if (initialContentType === 'templates') {
            setActiveTab('templates');
        } else if (initialContentType === 'content') {
            setActiveTab('documents');
        }
    }, [initialContentType]);

    useEffect(() => {
        if (!isOpen) {
            setSelectedItems({});
            return;
        }

        const loadContent = async () => {
            setIsLoading(true);
            try {
                const [docs, texts, generators, notebooks, templates] = await Promise.all([
                    profileApiService.getAvailableDocuments().catch(() => []),
                    profileApiService.getUserTexts().catch(() => []),
                    profileApiService.getCustomGenerators().catch(() => []),
                    profileApiService.getNotebookCollections().catch(() => []),
                    profileApiService.getUserTemplates().catch(() => [])
                ]);

                setContent({
                    documents: docs || [],
                    texts: texts || [],
                    generators: generators || [],
                    notebooks: notebooks || [],
                    templates: templates || []
                });
            } catch (error) {
                console.error('Error loading content:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadContent();
    }, [isOpen]);

    const handleToggleItem = useCallback((tabId, itemId) => {
        setSelectedItems(prev => {
            const tabSelections = prev[tabId] || [];
            const isSelected = tabSelections.includes(itemId);

            return {
                ...prev,
                [tabId]: isSelected
                    ? tabSelections.filter(id => id !== itemId)
                    : [...tabSelections, itemId]
            };
        });
    }, []);

    const handleSelectAll = useCallback((tabId) => {
        const items = content[tabId] || [];
        const allIds = items.map(item => item.id);
        const currentSelections = selectedItems[tabId] || [];
        const allSelected = allIds.length > 0 && allIds.every(id => currentSelections.includes(id));

        setSelectedItems(prev => ({
            ...prev,
            [tabId]: allSelected ? [] : allIds
        }));
    }, [content, selectedItems]);

    const totalSelectedCount = useMemo(() => {
        return Object.values(selectedItems).reduce((sum, arr) => sum + arr.length, 0);
    }, [selectedItems]);

    const handleShare = useCallback(async () => {
        if (totalSelectedCount === 0) return;

        setIsSaving(true);
        let successCount = 0;
        let errorCount = 0;

        try {
            for (const tab of CONTENT_TABS) {
                const itemIds = selectedItems[tab.id] || [];
                for (const itemId of itemIds) {
                    try {
                        await onShareContent(tab.contentType, itemId, {
                            permissions: READ_ONLY_PERMISSIONS,
                            targetGroupId: groupId
                        });
                        successCount++;
                    } catch (error) {
                        console.error(`Error sharing ${tab.id} item ${itemId}:`, error);
                        errorCount++;
                    }
                }
            }

            if (successCount > 0) {
                onSuccess?.(successCount);
            }
            if (errorCount > 0) {
                onError?.({ message: `${errorCount} Inhalt(e) konnten nicht hinzugefügt werden.` });
            }
        } catch (error) {
            onError?.(error);
        } finally {
            setIsSaving(false);
        }
    }, [selectedItems, totalSelectedCount, onShareContent, groupId, onSuccess, onError]);

    const handleBackdropClick = useCallback((e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') {
            onClose();
        }
    }, [onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    const currentItems = content[activeTab] || [];
    const currentSelections = selectedItems[activeTab] || [];
    const allSelected = currentItems.length > 0 && currentItems.every(item => currentSelections.includes(item.id));

    const modalContent = (
        <div className="add-content-modal-backdrop" onClick={handleBackdropClick}>
            <div className="add-content-modal" role="dialog" aria-modal="true" aria-labelledby="add-content-modal-title">
                <div className="add-content-modal-header">
                    <h2 id="add-content-modal-title">Inhalte zur Gruppe hinzufügen</h2>
                    <button
                        className="add-content-modal-close"
                        onClick={onClose}
                        aria-label="Schließen"
                    >
                        <HiX />
                    </button>
                </div>

                <div className="add-content-modal-tabs">
                    {CONTENT_TABS.map(tab => {
                        const Icon = tab.icon;
                        const count = (selectedItems[tab.id] || []).length;
                        return (
                            <button
                                key={tab.id}
                                className={`add-content-modal-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <Icon className="add-content-modal-tab-icon" />
                                <span>{tab.label}</span>
                                {count > 0 && <span className="add-content-modal-tab-badge">{count}</span>}
                            </button>
                        );
                    })}
                </div>

                <div className="add-content-modal-body">
                    {isLoading ? (
                        <div className="add-content-modal-loading">
                            <span>Lade Inhalte...</span>
                        </div>
                    ) : currentItems.length === 0 ? (
                        <div className="add-content-modal-empty">
                            <p>Keine Inhalte verfügbar.</p>
                        </div>
                    ) : (
                        <>
                            <div className="add-content-modal-select-all">
                                <label className="add-content-modal-checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={() => handleSelectAll(activeTab)}
                                    />
                                    <span>Alle auswählen ({currentItems.length})</span>
                                </label>
                            </div>
                            <div className="add-content-modal-list">
                                {currentItems.map(item => {
                                    const isSelected = currentSelections.includes(item.id);
                                    const title = item.title || item.name || 'Ohne Titel';
                                    const description = item.description || item.filename || '';

                                    return (
                                        <label
                                            key={item.id}
                                            className={`add-content-modal-item ${isSelected ? 'selected' : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleItem(activeTab, item.id)}
                                            />
                                            <div className="add-content-modal-item-info">
                                                <span className="add-content-modal-item-title">{title}</span>
                                                {description && (
                                                    <span className="add-content-modal-item-description">
                                                        {description.length > 80 ? `${description.substring(0, 80)}...` : description}
                                                    </span>
                                                )}
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                <div className="add-content-modal-footer">
                    <button
                        className="pabtn pabtn--m pabtn--ghost"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        Abbrechen
                    </button>
                    <button
                        className="pabtn pabtn--m pabtn--primary"
                        onClick={handleShare}
                        disabled={totalSelectedCount === 0 || isSaving || isSharing}
                    >
                        {isSaving ? 'Wird hinzugefügt...' : `${totalSelectedCount} hinzufügen`}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default AddContentToGroupModal;
