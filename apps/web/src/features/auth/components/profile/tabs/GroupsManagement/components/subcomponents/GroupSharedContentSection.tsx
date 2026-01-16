import React, { useState, useCallback } from 'react';
import SharedContentSelector from '../../../../../../../../features/groups/components/SharedContentSelector';
import { ProfileActionButton } from '../../../../../../../../components/profile/actions/ProfileActionButton';
import AddContentToGroupModal from './AddContentToGroupModal';
import { AddTemplateModal } from '../../../../../../../../components/common/AddTemplateModal';
import '../../../../../../../../assets/styles/features/groups/groups.css';

/** Base shared content item from the API */
interface SharedContentItemBase {
    id: string;
    title?: string;
    name?: string;
    description?: string;
    shared_at?: string;
    shared_by_name?: string;
    group_permissions?: {
        read?: boolean;
        write?: boolean;
        collaborative?: boolean;
    };
    content_preview?: string;
    full_content?: string;
    markdown_content?: string;
    word_count?: number;
    page_count?: number;
    document_count?: number;
    view_count?: number;
    preview_image_url?: string;
    thumbnail_url?: string;
    canva_url?: string;
    external_url?: string;
    content_data?: {
        originalUrl?: string;
    };
    slug?: string;
}

/** Group content data structure from API */
interface GroupContent {
    documents?: SharedContentItemBase[];
    texts?: SharedContentItemBase[];
    notebooks?: SharedContentItemBase[];
    generators?: SharedContentItemBase[];
    templates?: SharedContentItemBase[];
}

/** Share permissions for content */
interface SharePermissions {
    read: boolean;
    write: boolean;
    collaborative: boolean;
}

/** Options for sharing content to a group */
interface ShareOptions {
    permissions: SharePermissions | Record<string, boolean>;
    targetGroupId: string | null;
}

/** Template data returned from AddTemplateModal */
interface TemplateData {
    title: string;
    id?: string;
    description?: string;
}

/** Error object with message property */
interface ErrorWithMessage {
    message: string;
}

/** Props for GroupSharedContentSection */
interface GroupSharedContentSectionProps {
    groupContent: GroupContent | null;
    isLoadingGroupContent: boolean;
    isFetchingGroupContent: boolean;
    isAdmin: boolean;
    onUnshare: (contentType: string, contentId: string) => void;
    isUnsharing: boolean;
    groupId: string;
    onShareContent: (contentType: string, itemId: string | number, options: ShareOptions) => Promise<void>;
    isSharing: boolean;
    onRefetch?: () => Promise<unknown>;
    onSuccessMessage?: (message: string) => void;
    onErrorMessage?: (message: string) => void;
}

const GroupSharedContentSection: React.FC<GroupSharedContentSectionProps> = ({
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

    const handleContentShareSuccess = useCallback((count: number) => {
        onSuccessMessage?.(`${count} Inhalt(e) erfolgreich zur Gruppe hinzugefügt.`);
        onRefetch?.();
        handleCloseContentModal();
    }, [onSuccessMessage, onRefetch, handleCloseContentModal]);

    const handleContentShareError = useCallback((error: ErrorWithMessage | unknown) => {
        const errorMessage = (error as ErrorWithMessage)?.message || String(error);
        onErrorMessage?.(`Fehler beim Hinzufügen: ${errorMessage}`);
    }, [onErrorMessage]);

    const handleTemplateSuccess = useCallback((template: TemplateData) => {
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
                                cardStyle: 'default'
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
