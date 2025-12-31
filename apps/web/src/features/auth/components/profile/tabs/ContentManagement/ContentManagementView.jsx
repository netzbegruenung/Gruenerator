import React, { useState, useCallback, useEffect } from 'react';
import { motion } from "motion/react";

// Common components
import TabNavigation from '../../../../../../components/common/TabNavigation';
import ShareToGroupModal from '../../../../../../components/common/ShareToGroupModal';

// Content sections
import DocumentsSection from './components/DocumentsSection';
import AnweisungenSection from './components/AnweisungenSection';
import VorlagenSection from './components/VorlagenSection';

// Integration sections
import CanvaSection from './components/CanvaSection';
import WolkeSection from './components/WolkeSection';

// Hooks
import { useTabNavigation } from '../../../../../../hooks/useTabNavigation';
import { useMessageHandling } from '../../../../../../hooks/useMessageHandling';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';

// Utils
import * as documentAndTextUtils from '../../../../../../components/utils/documentAndTextUtils';

const ContentManagementView = ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    initialTab = 'inhalte',
    canvaSubsection = 'overview',
    onTabChange
}) => {
    // Beta features check
    const { canAccessBetaFeature } = useBetaFeatures();

    // Message handling
    const { clearMessages } = useMessageHandling(onSuccessMessage, onErrorMessage);

    // Available tabs - content plus integrations
    const availableTabs = [
        { key: 'inhalte', label: 'Inhalte' },
        ...(canAccessBetaFeature('vorlagen') ? [{ key: 'vorlagen', label: 'Meine Vorlagen' }] : []),
        // { key: 'wolke', label: 'Wolke' }, // Temporarily hidden
        ...(canAccessBetaFeature('canva') ? [{ key: 'canva', label: 'Canva' }] : []),
        { key: 'anweisungen', label: 'Anweisungen' }
    ];

    // Simple tab navigation
    const { currentTab, handleTabClick, setCurrentTab } = useTabNavigation(
        initialTab === 'dokumente' || initialTab === 'texte' ? 'inhalte' : initialTab,
        availableTabs,
        (tabKey) => {
            clearMessages();
            onTabChange?.(tabKey);
        }
    );

    // Sync tab state with URL changes
    useEffect(() => {
        const normalizedTab = initialTab === 'dokumente' || initialTab === 'texte' ? 'inhalte' : initialTab;
        setCurrentTab(prevTab => {
            if (prevTab !== normalizedTab) {
                return normalizedTab;
            }
            return prevTab;
        });
    }, [initialTab, setCurrentTab]);

    // =====================================================================
    // CANVA SUBSECTION HANDLING
    // =====================================================================

    // Canva subsection state for when user is on the Canva tab
    const [currentCanvaSubsection, setCurrentCanvaSubsection] = useState(canvaSubsection);

    // Update canva subsection when prop changes
    useEffect(() => {
        setCurrentCanvaSubsection(canvaSubsection);
    }, [canvaSubsection]);

    const handleCanvaSubsectionChange = useCallback((subsection) => {
        setCurrentCanvaSubsection(subsection);
        // Notify parent about the subsection change for URL updates
        onTabChange?.('canva', subsection);
    }, [onTabChange]);


    // =====================================================================
    // SHARED FUNCTIONALITY
    // =====================================================================

    // Modal state for sharing
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareContent, setShareContent] = useState(null);

    // Share functionality
    const handleShareToGroup = useCallback(async (contentType, contentId, contentTitle) => {
        // Standard sharing logic
        setShareContent({
            type: contentType,
            id: contentId,
            title: contentTitle
        });
        setShowShareModal(true);
    }, []);

    const handleCloseShareModal = () => {
        setShowShareModal(false);
        setShareContent(null);
    };

    const handleShareSuccess = (message) => {
        onSuccessMessage(message);
        handleCloseShareModal();
    };

    const handleShareError = (error) => {
        onErrorMessage(error);
    };

    const createShareAction = useCallback((contentType) => 
        documentAndTextUtils.createShareAction(contentType, handleShareToGroup), [handleShareToGroup]);

    // =====================================================================
    // RENDER METHODS
    // =====================================================================

    // Render main content based on current tab
    const renderMainContent = () => {
        if (currentTab === 'inhalte') {
            return (
                <DocumentsSection
                    isActive={isActive}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                    onShareToGroup={createShareAction('documents')}
                />
            );
        }

        if (currentTab === 'vorlagen') {
            return (
                <VorlagenSection
                    isActive={isActive}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                />
            );
        }

        if (currentTab === 'anweisungen') {
            return (
                <AnweisungenSection
                    isActive={isActive}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                />
            );
        }

        if (currentTab === 'canva') {
            return (
                <CanvaSection
                    isActive={isActive}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                    initialSubsection={currentCanvaSubsection}
                    onSubsectionChange={handleCanvaSubsectionChange}
                    onShareToGroup={handleShareToGroup}
                />
            );
        }

        if (currentTab === 'wolke') {
            return (
                <WolkeSection
                    isActive={isActive}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                />
            );
        }

        return <div>Content not found</div>;
    };

    const isSingleTab = availableTabs.length === 1;

    return (
        <motion.div
            className={`profile-content ${isSingleTab ? 'profile-full-width-layout' : 'profile-management-layout'}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            {!isSingleTab && (
                <div className="profile-navigation-panel">
                    <h2 className="profile-section-header">Einstellungen</h2>
                    <TabNavigation
                        tabs={availableTabs}
                        currentTab={currentTab}
                        onTabClick={handleTabClick}
                        orientation="vertical"
                    />
                </div>
            )}
            <div className="profile-content-panel profile-form-section">
                <div className="auth-form">
                    {renderMainContent()}
                </div>
            </div>

            {/* Share modal */}
            {showShareModal && (
                <ShareToGroupModal
                    isOpen={showShareModal}
                    onClose={handleCloseShareModal}
                    contentType={shareContent?.type}
                    contentId={shareContent?.id}
                    contentTitle={shareContent?.title}
                    onSuccess={handleShareSuccess}
                    onError={handleShareError}
                />
            )}
            
        </motion.div>
    );
};

export default ContentManagementView;