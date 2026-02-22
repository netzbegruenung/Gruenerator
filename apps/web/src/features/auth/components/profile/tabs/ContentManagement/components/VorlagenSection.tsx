import React, { useState, useCallback, memo, useMemo } from 'react';
import {
  HiPlus,
  HiExternalLink,
  HiOutlineTrash,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlinePencil,
} from 'react-icons/hi';

import AddTemplateModal from '../../../../../../../components/common/AddTemplateModal/AddTemplateModal';
import DocumentOverview, {
  type DocumentItem,
} from '../../../../../../../components/common/DocumentOverview';
import EditTemplateModal from '../../../../../../../components/common/EditTemplateModal';
import { Badge } from '../../../../../../../components/ui/badge';
import { Button } from '../../../../../../../components/ui/button';
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

// Static constants moved outside component
const EMPTY_STATE_CONFIG = {
  noDocuments: 'Du hast noch keine Vorlagen gespeichert.',
  createMessage:
    'Füge Vorlagen über den Button oben hinzu oder durchsuche die öffentliche Galerie.',
} as const;

const VorlagenSection = memo(
  ({ isActive, onSuccessMessage, onErrorMessage }: VorlagenSectionProps): React.ReactElement => {
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

    const {
      query: templatesQuery,
      deleteTemplate,
      updateTemplateVisibility,
      updateTemplate,
    } = useUserTemplates({ isActive });

    const { data: templatesData = [], isLoading } = templatesQuery;
    const templates = templatesData as Template[];

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [togglingVisibilityId, setTogglingVisibilityId] = useState<string | null>(null);

    const handleDeleteWithConfirm = useCallback(
      async (template: Template) => {
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
      },
      [deleteTemplate, onSuccessMessage, onErrorMessage]
    );

    const handleToggleVisibility = useCallback(
      async (template: Template) => {
        const newIsPrivate = !template.is_private;
        setTogglingVisibilityId(template.id);
        try {
          await updateTemplateVisibility(template.id, newIsPrivate);
          onSuccessMessage(
            newIsPrivate ? 'Vorlage ist jetzt privat.' : 'Vorlage wurde veröffentlicht.'
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          onErrorMessage('Fehler beim Ändern der Sichtbarkeit: ' + errorMessage);
        } finally {
          setTogglingVisibilityId(null);
        }
      },
      [updateTemplateVisibility, onSuccessMessage, onErrorMessage]
    );

    const handleSaveTemplate = useCallback(
      async (templateId: string, data: Partial<Template>) => {
        await updateTemplate(templateId, data);
      },
      [updateTemplate]
    );

    const getTemplateActionItems = useCallback(
      (item: DocumentItem): ActionItem[] => {
        const template = item as Template;
        const actions: ActionItem[] = [];

        actions.push({
          icon: HiOutlinePencil,
          label: 'Bearbeiten',
          onClick: () => setEditingTemplate(template),
        });

        if (template.external_url || template.content_data?.originalUrl) {
          actions.push({
            icon: HiExternalLink,
            label: 'Vorlage öffnen',
            onClick: () =>
              window.open(template.content_data?.originalUrl || template.external_url, '_blank'),
          });
        }

        actions.push({
          icon: template.is_private ? HiOutlineEye : HiOutlineEyeOff,
          label: template.is_private ? 'Veröffentlichen' : 'Privat machen',
          onClick: () => void handleToggleVisibility(template),
          loading: togglingVisibilityId === template.id,
        });

        actions.push({ separator: true });

        actions.push({
          icon: HiOutlineTrash,
          label: 'Löschen',
          onClick: () => void handleDeleteWithConfirm(template),
          danger: true,
          loading: deletingId === template.id,
        });

        return actions;
      },
      [deletingId, togglingVisibilityId, handleDeleteWithConfirm, handleToggleVisibility]
    );

    const renderTemplateMetadata = useCallback((item: DocumentItem) => {
      const template = item as Template;
      return (
        <div className="flex gap-xs flex-wrap">
          {template.template_type && (
            <Badge variant="secondary">
              {template.template_type.charAt(0).toUpperCase() + template.template_type.slice(1)}
            </Badge>
          )}
          {template.is_private === false && (
            <Badge className="bg-primary-500 text-white">Öffentlich</Badge>
          )}
        </div>
      );
    }, []);

    // Memoized handlers
    const handleFetch = useCallback(() => templatesQuery.refetch(), [templatesQuery]);
    const handleOpenAddModal = useCallback(() => setShowAddModal(true), []);
    const handleCloseAddModal = useCallback(() => setShowAddModal(false), []);
    const handleCloseEditModal = useCallback(() => setEditingTemplate(null), []);
    const handleNavigateToGallery = useCallback(() => {
      window.location.href = '/datenbank/vorlagen';
    }, []);

    const handleAddSuccess = useCallback(() => {
      void templatesQuery.refetch();
      onSuccessMessage('Vorlage wurde hinzugefügt.');
      setShowAddModal(false);
    }, [templatesQuery, onSuccessMessage]);

    const handleEditSuccess = useCallback(() => {
      void templatesQuery.refetch();
      onSuccessMessage('Vorlage wurde aktualisiert.');
    }, [templatesQuery, onSuccessMessage]);

    // Memoized title
    const vorlagenTitle = useMemo(() => `Meine Vorlagen (${templates.length})`, [templates.length]);

    return (
      <div>
        <DocumentOverview
          items={templates}
          loading={isLoading}
          onFetch={handleFetch}
          actionItems={getTemplateActionItems}
          metaRenderer={renderTemplateMetadata}
          emptyStateConfig={EMPTY_STATE_CONFIG}
          searchPlaceholder="Vorlagen durchsuchen..."
          title={vorlagenTitle}
          enableBulkSelect={true}
          headerActions={
            <div className="flex gap-xs">
              <Button size="sm" onClick={handleOpenAddModal}>
                <HiPlus />
                Vorlage hinzufügen
              </Button>
              <Button variant="outline" size="sm" onClick={handleNavigateToGallery}>
                Zur Galerie
              </Button>
            </div>
          }
        />

        <AddTemplateModal
          isOpen={showAddModal}
          onClose={handleCloseAddModal}
          onSuccess={handleAddSuccess}
        />

        {editingTemplate && (
          <EditTemplateModal
            isOpen={true}
            onClose={handleCloseEditModal}
            onSave={handleSaveTemplate}
            onSuccess={handleEditSuccess}
            template={editingTemplate}
          />
        )}
      </div>
    );
  }
);

VorlagenSection.displayName = 'VorlagenSection';

export default VorlagenSection;
