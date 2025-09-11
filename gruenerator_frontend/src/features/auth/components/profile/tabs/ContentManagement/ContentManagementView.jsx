import React, { useState, useCallback, useEffect } from 'react';
import { motion } from "motion/react";

// Common components
import TabNavigation from '../../../../../../components/common/TabNavigation';
import ShareToGroupModal from '../../../../../../components/common/ShareToGroupModal';

// Content sections
import DocumentsSection from './components/DocumentsSection';
import TextsSection from './components/TextsSection';

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
    initialTab = 'dokumente',
    onTabChange
}) => {
    // Beta features check
    const { canAccessBetaFeature } = useBetaFeatures();
    
    // Message handling
    const { clearMessages, showSuccess, showError } = useMessageHandling(onSuccessMessage, onErrorMessage);
    
    // Available tabs - separate Documents and Texts
    const availableTabs = [
        { key: 'dokumente', label: 'Dokumente' },
        { key: 'texte', label: 'Texte' }
    ];
    
    // Use initialTab as-is since we now have separate tabs
    let normalizedInitialTab = initialTab;

    // Simple tab navigation like IntelligenceTab
    const { currentTab, handleTabClick, setCurrentTab } = useTabNavigation(
        normalizedInitialTab,
        availableTabs,
        (tabKey) => {
            clearMessages();
            onTabChange?.(tabKey);
        }
    );
    
    // Sync tab state with URL changes - prevent circular dependency
    useEffect(() => {
        // Use functional update to get current state without dependency
        setCurrentTab(prevTab => {
            if (prevTab !== initialTab) {
                return initialTab;
            }
            return prevTab;
        });
    }, [initialTab, setCurrentTab]);


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
        if (currentTab === 'dokumente') {
            return (
                <DocumentsSection
                    isActive={isActive}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                    onShareToGroup={createShareAction('documents')}
                />
            );
        }
        
        if (currentTab === 'texte') {
            return (
                <TextsSection
                    isActive={isActive}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                    onShareToGroup={createShareAction('user_documents')}
                />
            );
        }
        
        return <div>Content not found</div>;
    };

    return (
        <motion.div 
            className="profile-content profile-management-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="profile-navigation-panel">
                <TabNavigation
                    tabs={availableTabs}
                    currentTab={currentTab}
                    onTabClick={handleTabClick}
                    orientation="vertical"
                />
            </div>
            <div className="profile-content-panel profile-form-section">
                <div className="profile-content-card">
                    <div className="auth-form">
                        {renderMainContent()}
                    </div>
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