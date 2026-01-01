import React, { useState, useCallback, useMemo } from 'react';
import { HiDocumentText, HiExternalLink } from 'react-icons/hi';
import { CitationModal } from '../../../components/common/Citation';
import ChatWorkbenchLayout from '../../../components/common/Chat/ChatWorkbenchLayout';
import ErrorBoundary from '../../../components/ErrorBoundary';
import useNotebookChat from '../hooks/useNotebookChat';
import NotebookChatMessage from './NotebookChatMessage';
import FilterDropdownButton from './FilterDropdownButton';
import ActiveFiltersDisplay from './ActiveFiltersDisplay';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { useAuthStore } from '../../../stores/authStore';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import '../../../assets/styles/features/notebook/notebook-chat.css';

const NotebookPageContent = ({ config }) => {
    const isMulti = config.collectionType === 'multi';
    const locale = useAuthStore((state) => state.locale);

    // Filter collections by user locale (de-DE or de-AT)
    const localeCollections = useMemo(() => {
        if (!isMulti) return config.collections;
        return config.collections.filter(c => !c.locale || c.locale === locale);
    }, [isMulti, config.collections, locale]);

    const [selectedIds, setSelectedIds] = useState(() =>
        isMulti ? localeCollections.map(c => c.id) : []
    );

    const selectedCollections = useMemo(() => {
        if (isMulti) {
            return localeCollections.filter(c => selectedIds.includes(c.id));
        }
        return localeCollections;
    }, [isMulti, localeCollections, selectedIds]);

    const sources = useMemo(() => {
        if (isMulti) {
            return localeCollections.map(c => ({
                id: c.id,
                name: c.name,
                count: c.documentCount,
                selected: selectedIds.includes(c.id)
            }));
        }
        return config.sources;
    }, [isMulti, localeCollections, config.sources, selectedIds]);

    const handleSourceToggle = useCallback((sourceId) => {
        setSelectedIds(prev => {
            if (prev.includes(sourceId)) {
                return prev.filter(id => id !== sourceId);
            }
            return [...prev, sourceId];
        });
    }, []);

    const extraApiParams = useMemo(() => {
        if (config.useSystemUserId && config.systemUserId) {
            return { search_user_id: config.systemUserId };
        }
        return {};
    }, [config.useSystemUserId, config.systemUserId]);

    const {
        chatMessages, inputValue, submitLoading, isMobileView,
        activeCollections, setInputValue, handleSubmitQuestion
    } = useNotebookChat({
        collections: selectedCollections,
        persistMessages: config.persistMessages,
        extraApiParams
    });

    const HeaderIcon = config.headerIcon;

    const renderInfoPanel = () => (
        <div className="qa-collection-info">
            <div className="qa-collection-info-header">
                <HeaderIcon className="qa-collection-info-icon" />
                <h3>{config.title}</h3>
            </div>
            <div className="qa-collection-info-description">
                {config.infoPanelDescription}
            </div>

            <div className="qa-collection-info-documents">
                <h4>{isMulti ? 'Verfügbare Quellen:' : 'Verfügbare Dokumente:'}</h4>
                {isMulti ? (
                    localeCollections.map((collection) => {
                        const CollectionIcon = collection.icon || HiDocumentText;
                        return (
                            <div key={collection.id} className="qa-multi-collection-item">
                                <div className="qa-multi-collection-header">
                                    <CollectionIcon className="document-icon" />
                                    <span className="qa-multi-collection-name">{collection.name}</span>
                                    <span className="qa-multi-collection-count">{collection.documentCount}</span>
                                </div>
                                {collection.description && (
                                    <div className="qa-multi-collection-description">
                                        {collection.description}
                                    </div>
                                )}
                                {collection.externalUrl && (
                                    <a
                                        href={collection.externalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="qa-multi-collection-link"
                                    >
                                        <HiExternalLink className="source-icon" />
                                        <span>{collection.externalUrl.replace('https://', '').replace('www.', '')}</span>
                                    </a>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <ul>
                        {config.documents?.map((doc, i) => (
                            <li key={i}>
                                <HiDocumentText className="document-icon" />
                                <span>{doc.title} ({doc.detail})</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {config.externalUrl && !isMulti && (
                <div className="qa-collection-info-source">
                    <a
                        href={config.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="source-link"
                    >
                        <HiExternalLink className="source-icon" />
                        <span>{config.externalUrl.replace('https://', '').replace('www.', '')}</span>
                    </a>
                </div>
            )}

            {submitLoading && isMulti && activeCollections.length > 0 && (
                <div className="qa-collection-info-loading">
                    <div className="qa-loading-indicator">
                        Durchsuche {activeCollections.length} Quellen...
                    </div>
                    <div className="qa-loading-collections">
                        {activeCollections.map((name, i) => (
                            <span key={i} className="qa-loading-collection-badge">{name}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <ErrorBoundary>
            <div className="notebook-beta-warning">
                <span>Diese Funktion befindet sich in der Beta-Phase. Antworten können ungenau sein.</span>
            </div>
            <CitationModal />
            <ChatWorkbenchLayout
                mode="chat"
                modes={{ chat: { label: 'Chat' } }}
                onModeChange={() => {}}
                title={config.title}
                messages={chatMessages}
                onSubmit={handleSubmitQuestion}
                isProcessing={submitLoading}
                placeholder={config.placeholder}
                inputValue={inputValue}
                onInputChange={setInputValue}
                disabled={submitLoading}
                renderMessage={(msg, i) => (
                    <NotebookChatMessage key={msg.timestamp || `msg-${i}`} msg={msg} index={i} />
                )}
                infoPanelContent={isMobileView ? null : renderInfoPanel()}
                enableVoiceInput={true}
                hideHeader={true}
                hideModeSelector={true}
                singleLine={true}
                showStartPage={true}
                startPageTitle={config.startPageTitle}
                exampleQuestions={config.exampleQuestions}
                sources={sources}
                onSourceToggle={isMulti ? handleSourceToggle : undefined}
                filterButton={<FilterDropdownButton collections={selectedCollections} />}
                filterBar={<ActiveFiltersDisplay collections={selectedCollections} />}
            />
        </ErrorBoundary>
    );
};

const NotebookPage = ({ configId }) => {
    const config = getNotebookConfig(configId);
    return <NotebookPageContent config={config} />;
};

export const createNotebookPage = (configId) => {
    const config = getNotebookConfig(configId);
    const Page = () => <NotebookPageContent config={config} />;
    return withAuthRequired(Page, { title: config.authTitle });
};

export default NotebookPage;
