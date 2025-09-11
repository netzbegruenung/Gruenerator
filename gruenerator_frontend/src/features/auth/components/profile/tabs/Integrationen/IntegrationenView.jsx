import React, { useCallback, useEffect } from 'react';
import { motion } from "motion/react";

// Common components
import TabNavigation from '../../../../../../components/common/TabNavigation';
import ShareToGroupModal from '../../../../../../components/common/ShareToGroupModal';

// Integration sections
import CanvaSection from './components/CanvaSection';
import WolkeSection from './components/WolkeSection';

// Hooks
import { useMessageHandling } from '../../../../../../hooks/useMessageHandling';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';

// Store
import { 
    useProfileStore, 
    useIntegrationTab, 
    useCanvaSubsection, 
    useShareModal 
} from '../../../../../../stores/profileStore';

const IntegrationenView = ({ 
    isActive, 
    onSuccessMessage, 
    onErrorMessage,
    initialTab = 'canva',
    canvaSubsection = 'overview'
}) => {
    // Beta features check
    const { canAccessBetaFeature } = useBetaFeatures();
    
    // Message handling
    const { clearMessages, showSuccess, showError } = useMessageHandling(onSuccessMessage, onErrorMessage);
    
    // Store state and actions
    const currentTab = useIntegrationTab();
    const currentCanvaSubsection = useCanvaSubsection();
    const shareModal = useShareModal();
    
    const { 
        setIntegrationTab, 
        setCanvaSubsection, 
        openShareModal, 
        closeShareModal,
        initializeIntegrationTab
    } = useProfileStore();
    
    // Available tabs - check beta feature access
    const availableTabs = [
        ...(canAccessBetaFeature('canva') ? [{ key: 'canva', label: 'Canva' }] : []),
        { key: 'wolke', label: 'Wolke' }
    ];

    // Initialize tab on mount
    useEffect(() => {
        initializeIntegrationTab(initialTab, canAccessBetaFeature('canva'));
        if (canvaSubsection !== 'overview') {
            setCanvaSubsection(canvaSubsection);
        }
    }, [initialTab, canvaSubsection, canAccessBetaFeature, initializeIntegrationTab, setCanvaSubsection]);

    // Tab click handler
    const handleTabClick = useCallback((tabKey) => {
        setIntegrationTab(tabKey);
        clearMessages();
    }, [setIntegrationTab, clearMessages]);

    // =====================================================================
    // SHARED FUNCTIONALITY
    // =====================================================================

    // Share functionality
    const handleShareToGroup = useCallback((contentType, contentId, contentTitle) => {
        openShareModal(contentType, contentId, contentTitle);
    }, [openShareModal]);

    const handleCloseShareModal = useCallback(() => {
        closeShareModal();
    }, [closeShareModal]);

    const handleShareSuccess = useCallback((message) => {
        onSuccessMessage(message);
        closeShareModal();
    }, [onSuccessMessage, closeShareModal]);

    const handleShareError = useCallback((error) => {
        onErrorMessage(error);
    }, [onErrorMessage]);

    // =====================================================================
    // CANVA SUBSECTION HANDLING
    // =====================================================================

    const handleCanvaSubsectionChange = useCallback((subsection) => {
        setCanvaSubsection(subsection);
    }, [setCanvaSubsection]);

    // =====================================================================
    // RENDER METHODS
    // =====================================================================

    // Render main content based on current tab
    const renderMainContent = () => {
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
        
        return <div>Integration not found</div>;
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
            {shareModal.isOpen && (
                <ShareToGroupModal
                    isOpen={shareModal.isOpen}
                    onClose={handleCloseShareModal}
                    contentType={shareModal.content?.type}
                    contentId={shareModal.content?.id}
                    contentTitle={shareModal.content?.title}
                    onSuccess={handleShareSuccess}
                    onError={handleShareError}
                />
            )}
        </motion.div>
    );
};

export default IntegrationenView;