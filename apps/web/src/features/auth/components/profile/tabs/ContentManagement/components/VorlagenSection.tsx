import React, { useState, useCallback } from 'react';
import { HiPlus, HiExternalLink, HiOutlineTrash, HiOutlineEye, HiOutlineEyeOff, HiOutlinePencil } from 'react-icons/hi';

import DocumentOverview, { type DocumentItem } from '../../../../../../../components/common/DocumentOverview';
import AddTemplateModal from '../../../../../../../components/common/AddTemplateModal/AddTemplateModal';
import EditTemplateModal from '../../../../../../../components/common/EditTemplateModal';
import { useUserTemplates } from '../../../../../hooks/useProfileData';

interface Template extends DocumentItem {
    id: string;
    title: string;
    is_private?: boolean;
    template_type?: string;
    external_url?: string;
    content_data?: {
        originalUrl?: string;
    };
}

interface ActionItem {
    icon?: React.ComponentType<{ className?: string }>;
    label?: string;
    onClick?: () => void;
    loading?: boolean;
    danger?: boolean;
    separator?: boolean;
}

interface VorlagenSectionProps {
    isActive: boolean;
    onSuccessMessage: (message: string) => void;
    onErrorMessage: (message: string) => void;
}

const VorlagenSection = ({ isActive, onSuccessMessage, onErrorMessage }: VorlagenSectionProps): React.ReactElement => {
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

    const {
        query: templatesQuery,
        deleteTemplate,
        updateTemplateVisibility,
        updateTemplate
    } = useUserTemplates({ isActive });

    const { data: templatesData = [], isLoading } = templatesQuery;
    const templates = templatesData as Template[];

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [togglingVisibilityId, setTogglingVisibilityId] = useState<string | null>(null);

    const handleDeleteWithConfirm = useCallback(async (template: Template) => {
        if (!window.confirm(`Möchtest du die Vorlage "${template.title}" wirklich löschen?`)) {
            return;
        }
        setDeletingId(template.id);
        try {
            await deleteTemplate(template.id);
            onSuccessMessage('Vorlage wurde gelöscht.');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            onErrorMessage('Fehler beim Löschen: ' + errorMessage);
        } finally {
            setDeletingId(null);
        }
    }, [deleteTemplate, onSuccessMessage, onErrorMessage]);

    const handleToggleVisibility = useCallback(async (template: Template) => {
        const newIsPrivate = !template.is_private;
        setTogglingVisibilityId(template.id);
        try {
            await updateTemplateVisibility(template.id, newIsPrivate);
            onSuccessMessage(newIsPrivate ? 'Vorlage ist jetzt privat.' : 'Vorlage wurde veröffentlicht.');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            onErrorMessage('Fehler beim Ändern der Sichtbarkeit: ' + errorMessage);
        } finally {
            setTogglingVisibilityId(null);
        }
    }, [updateTemplateVisibility, onSuccessMessage, onErrorMessage]);

    const handleSaveTemplate = useCallback(async (templateId: string, data: Partial<Template>) => {
        await updateTemplate(templateId, data);
    }, [updateTemplate]);

    const getTemplateActionItems = useCallback((template: Template): ActionItem[] => {
        const actions: ActionItem[] = [];

        actions.push({
            icon: HiOutlinePencil,
            label: 'Bearbeiten',
            onClick: () => setEditingTemplate(template)
        });

        if (template.external_url || template.content_data?.originalUrl) {
            actions.push({
                icon: HiExternalLink,
                label: 'In Canva öffnen',
                onClick: () => window.open(template.content_data?.originalUrl || template.external_url, '_blank')
            });
        }

        actions.push({
            icon: template.is_private ? HiOutlineEye : HiOutlineEyeOff,
            label: template.is_private ? 'Veröffentlichen' : 'Privat machen',
            onClick: () => handleToggleVisibility(template),
            loading: togglingVisibilityId === template.id
        });

        actions.push({ separator: true });

        actions.push({
            icon: HiOutlineTrash,
            label: 'Löschen',
            onClick: () => handleDeleteWithConfirm(template),
            danger: true,
            loading: deletingId === template.id
        });

        return actions;
    }, [deletingId, togglingVisibilityId, handleDeleteWithConfirm, handleToggleVisibility]);

    const renderTemplateMetadata = (template: Template) => (
        <div style={{ display: 'flex', gap: 'var(--spacing-small)', flexWrap: 'wrap' }}>
            {template.template_type && (
                <span className="document-type">
                    {template.template_type.charAt(0).toUpperCase() + template.template_type.slice(1)}
                </span>
            )}
            {template.is_private === false && (
                <span className="document-type" style={{ background: 'var(--klee)' }}>
                    Öffentlich
                </span>
            )}
        </div>
    );

    return (
        <div className="vorlagen-section">
            <DocumentOverview
                items={templates}
                loading={isLoading}
                onFetch={() => templatesQuery.refetch()}
                actionItems={getTemplateActionItems}
                metaRenderer={renderTemplateMetadata}
                emptyStateConfig={{
                    noDocuments: 'Du hast noch keine Vorlagen gespeichert.',
                    createMessage: 'Füge Canva-Vorlagen über den Button oben hinzu oder durchsuche die öffentliche Galerie.'
                }}
                searchPlaceholder="Vorlagen durchsuchen..."
                title={`Meine Vorlagen (${templates.length})`}
                enableBulkSelect={true}
                headerActions={
                    <div style={{ display: 'flex', gap: 'var(--spacing-small)' }}>
                        <button
                            type="button"
                            className="pabtn pabtn--primary pabtn--s"
                            onClick={() => setShowAddModal(true)}
                        >
                            <HiPlus className="pabtn__icon" />
                            <span className="pabtn__label">Vorlage hinzufügen</span>
                        </button>
                        <button
                            type="button"
                            className="pabtn pabtn--secondary pabtn--s"
                            onClick={() => { window.location.href = '/datenbank/vorlagen'; }}
                        >
                            <span className="pabtn__label">Zur Galerie</span>
                        </button>
                    </div>
                }
            />

            <AddTemplateModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSuccess={() => {
                    templatesQuery.refetch();
                    onSuccessMessage('Vorlage wurde hinzugefügt.');
                    setShowAddModal(false);
                }}
            />

            <EditTemplateModal
                isOpen={!!editingTemplate}
                onClose={() => setEditingTemplate(null)}
                onSave={handleSaveTemplate}
                onSuccess={() => {
                    templatesQuery.refetch();
                    onSuccessMessage('Vorlage wurde aktualisiert.');
                }}
                template={editingTemplate}
            />
        </div>
    );
};

export default VorlagenSection;
