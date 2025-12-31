import React, { useState, useCallback } from 'react';
import SharedContentSelector from '../../../../../../../../features/groups/components/SharedContentSelector';
import { ProfileActionButton } from '../../../../../../../../components/profile/actions/ProfileActionButton';
import AddContentToGroupModal from './AddContentToGroupModal';
import { AddTemplateModal } from '../../../../../../../../components/common/AddTemplateModal';
import '../../../../../../../../assets/styles/features/groups/groups.css';

const GroupSharedContentSection = ({
    groupContent,
    isLoadingGroupContent,
    isFetchingGroupContent,
    isAdmin,
    onUnshare,
    isUnsharing,
    groupId,
    onShareContent,
    isSharing,
    onRefetch,
    onSuccessMessage,
    onErrorMessage
}) => {
    const [isContentModalOpen, setIsContentModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

    const handleOpenContentModal = useCallback(() => {
        setIsContentModalOpen(true);
    }, []);

    const handleCloseContentModal = useCallback(() => {
        setIsContentModalOpen(false);
    }, []);

    const handleOpenTemplateModal = useCallback(() => {
        setIsTemplateModalOpen(true);
    }, []);

    const handleCloseTemplateModal = useCallback(() => {
        setIsTemplateModalOpen(false);
    }, []);

    const handleContentShareSuccess = useCallback((count) => {
        onSuccessMessage?.(`${count} Inhalt(e) erfolgreich zur Gruppe hinzugefügt.`);
        onRefetch?.();
        handleCloseContentModal();
    }, [onSuccessMessage, onRefetch, handleCloseContentModal]);

    const handleContentShareError = useCallback((error) => {
        onErrorMessage?.(`Fehler beim Hinzufügen: ${error.message || error}`);
    }, [onErrorMessage]);

    const handleTemplateSuccess = useCallback((template) => {
        onSuccessMessage?.(`Vorlage "${template.title}" erfolgreich zur Gruppe hinzugefügt.`);
        onRefetch?.();
    }, [onSuccessMessage, onRefetch]);

    const handleRefresh = useCallback(async () => {
        console.log('[GroupSharedContentSection] Refresh clicked, onRefetch:', onRefetch);
        if (onRefetch) {
            console.log('[GroupSharedContentSection] Calling refetch...');
            const result = await onRefetch();
            console.log('[GroupSharedContentSection] Refetch result:', result);
        }
    }, [onRefetch]);

    return (
        <div className="group-content-card">
            <div className="group-content-header">
                <ProfileActionButton
                    action="refresh"
                    label="Aktualisieren"
                    variant="ghost"
                    size="s"
                    onClick={handleRefresh}
                    loading={isFetchingGroupContent}
                    spinOnLoading={true}
                    disabled={isLoadingGroupContent}
                />
            </div>
            <div className="profile-cards-grid">
                <div className="profile-card">
                    <div className="profile-card-header">
                        <h3>Geteilte Inhalte</h3>
                        <ProfileActionButton
                            action="add"
                            label="Hinzufügen"
                            variant="secondary"
                            size="s"
                            onClick={handleOpenContentModal}
                        />
                    </div>
                    <div className="profile-card-content">
                        <SharedContentSelector
                            groupContent={groupContent}
                            isLoading={isLoadingGroupContent}
                            isAdmin={isAdmin}
                            onUnshare={onUnshare}
                            isUnsharing={isUnsharing}
                            config={{
                                hideHeader: true,
                                excludeTypes: ['database'],
                                hideFilters: ['permissions'],
                                cardStyle: 'content-default'
                            }}
                        />
                    </div>
                </div>

                <div className="profile-card">
                    <div className="profile-card-header">
                        <h3>Geteilte Vorlagen</h3>
                        <ProfileActionButton
                            action="add"
                            label="Hinzufügen"
                            variant="secondary"
                            size="s"
                            onClick={handleOpenTemplateModal}
                        />
                    </div>
                    <div className="profile-card-content">
                        <SharedContentSelector
                            groupContent={groupContent}
                            isLoading={isLoadingGroupContent}
                            isAdmin={isAdmin}
                            onUnshare={onUnshare}
                            isUnsharing={isUnsharing}
                            config={{
                                hideHeader: true,
                                contentFilter: 'database',
                                hideFilters: ['contentType', 'permissions'],
                                cardStyle: 'template-square',
                                gridConfig: {
                                    minCardWidth: '280px',
                                    aspectRatio: '1:1'
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

            <AddContentToGroupModal
                isOpen={isContentModalOpen}
                onClose={handleCloseContentModal}
                groupId={groupId}
                onShareContent={onShareContent}
                isSharing={isSharing}
                onSuccess={handleContentShareSuccess}
                onError={handleContentShareError}
                initialContentType="content"
            />

            <AddTemplateModal
                isOpen={isTemplateModalOpen}
                onClose={handleCloseTemplateModal}
                groupId={groupId}
                onShareContent={onShareContent}
                onSuccess={handleTemplateSuccess}
            />
        </div>
    );
};

export default GroupSharedContentSection;
