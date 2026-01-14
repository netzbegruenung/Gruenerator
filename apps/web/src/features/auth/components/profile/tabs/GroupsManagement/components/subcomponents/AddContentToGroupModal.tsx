import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { HiX, HiDocumentText, HiCollection } from 'react-icons/hi';
import type { IconType } from 'react-icons';
import { profileApiService } from '../../../../../../services/profileApiService';
import { useDocumentsStore } from '../../../../../../../../stores/documentsStore';
import { ICONS } from '../../../../../../../../config/icons';
import '../../../../../../../../assets/styles/features/groups/add-content-modal.css';

interface ContentItem {
    id: string | number;
    title?: string;
    name?: string;
    description?: string;
    filename?: string;
}

interface ContentTab {
    id: TabId;
    label: string;
    icon: IconType;
    contentType: string;
}

type TabId = 'documents' | 'texts' | 'generators' | 'notebooks' | 'templates';

interface ContentState {
    documents: ContentItem[];
    texts: ContentItem[];
    generators: ContentItem[];
    notebooks: ContentItem[];
    templates: ContentItem[];
}

interface SelectedItemsState {
    [key: string]: (string | number)[];
}

interface SharePermissions {
    read: boolean;
    write: boolean;
    collaborative: boolean;
}

interface ShareOptions {
    permissions: SharePermissions;
    targetGroupId: string;
}

interface AddContentToGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    groupId: string;
    onShareContent: (contentType: string, itemId: string | number, options: ShareOptions) => Promise<void>;
    isSharing?: boolean;
    onSuccess?: (count: number) => void;
    onError?: (error: { message: string } | unknown) => void;
    initialContentType?: 'templates' | 'content' | string;
}

const CONTENT_TABS: ContentTab[] = [
    { id: 'documents', label: 'Dokumente', icon: HiDocumentText, contentType: 'documents' },
    { id: 'texts', label: 'Texte', icon: HiDocumentText, contentType: 'user_documents' },
    { id: 'generators', label: 'Generatoren', icon: HiCollection, contentType: 'custom_generators' },
    { id: 'notebooks', label: 'Notebooks', icon: ICONS.actions.notebook as IconType, contentType: 'notebook_collections' },
    { id: 'templates', label: 'Vorlagen', icon: HiCollection, contentType: 'database' }
];

const READ_ONLY_PERMISSIONS: SharePermissions = { read: true, write: false, collaborative: false };

const AddContentToGroupModal: React.FC<AddContentToGroupModalProps> = ({
    isOpen,
    onClose,
    groupId,
    onShareContent,
    isSharing,
    onSuccess,
    onError,
    initialContentType
}) => {
    const [activeTab, setActiveTab] = useState<TabId>('documents');
    const [selectedItems, setSelectedItems] = useState<SelectedItemsState>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [content, setContent] = useState<ContentState>({
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
                    profileApiService.getAvailableDocuments().catch((): ContentItem[] => []),
                    profileApiService.getUserTexts().catch((): ContentItem[] => []),
                    profileApiService.getCustomGenerators().catch((): ContentItem[] => []),
                    profileApiService.getNotebookCollections().catch((): ContentItem[] => []),
                    profileApiService.getUserTemplates().catch((): ContentItem[] => [])
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

    const handleToggleItem = useCallback((tabId: TabId, itemId: string | number) => {
        setSelectedItems(prev => {
            const tabSelections = prev[tabId] || [];
            const isSelected = tabSelections.some(id => String(id) === String(itemId));

            return {
                ...prev,
                [tabId]: isSelected
                    ? tabSelections.filter(id => String(id) !== String(itemId))
                    : [...tabSelections, itemId]
            };
        });
    }, []);

    const handleSelectAll = useCallback((tabId: TabId) => {
        const items = content[tabId] || [];
        const allIds = items.map((item: ContentItem) => item.id);
        const currentSelections = selectedItems[tabId] || [];
        const allSelected = allIds.length > 0 && allIds.every(id => currentSelections.some(sel => String(sel) === String(id)));

        setSelectedItems(prev => ({
            ...prev,
            [tabId]: allSelected ? [] : allIds
        }));
    }, [content, selectedItems]);

    const totalSelectedCount = useMemo(() => {
        return Object.values(selectedItems).reduce((sum: number, arr: (string | number)[]) => sum + arr.length, 0);
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

    const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
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

    const currentItems: ContentItem[] = content[activeTab] || [];
    const currentSelections: (string | number)[] = selectedItems[activeTab] || [];
    const allSelected = currentItems.length > 0 && currentItems.every((item: ContentItem) => currentSelections.some(sel => String(sel) === String(item.id)));

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
                                {currentItems.map((item: ContentItem) => {
                                    const isSelected = currentSelections.some(sel => String(sel) === String(item.id));
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
