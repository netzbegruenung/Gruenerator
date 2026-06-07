import { instantiateUserTemplate } from '@gruenerator/shared';
import { useCallback, useState } from 'react';
import {
  HiExternalLink,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlinePencil,
  HiOutlineTrash,
} from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { isCanvasEditorType, type Template } from '../types';

import { useUserTemplates } from '@/features/auth/hooks/useProfileData';

export interface TemplateAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
}

interface UseTemplateActionsArgs {
  onEdit: (template: Template) => void;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const externalUrl = (t: Template): string | undefined =>
  t.content_data?.originalUrl || t.external_url || undefined;

export const useTemplateActions = ({ onEdit }: UseTemplateActionsArgs) => {
  const navigate = useNavigate();
  const { query, deleteTemplate, updateTemplateVisibility, updateTemplate } = useUserTemplates({
    isActive: true,
  });
  // Guards the async open of a canvas-editor template against double-clicks.
  const [openingId, setOpeningId] = useState<string | null>(null);

  const openTemplate = useCallback(
    async (t: Template): Promise<void> => {
      if (isCanvasEditorType(t)) {
        if (openingId) return;
        setOpeningId(t.id);
        try {
          const result = await instantiateUserTemplate({
            templateId: String(t.id),
            title: t.title,
          });
          void navigate(
            result.subtype === 'boards'
              ? `/boards/${result.documentId}`
              : `/docs/${result.documentId}`
          );
        } catch (e) {
          toast.error('Vorlage konnte nicht geöffnet werden: ' + errText(e));
        } finally {
          setOpeningId(null);
        }
        return;
      }
      const url = externalUrl(t);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    },
    [navigate, openingId]
  );

  const toggleVisibility = useCallback(
    async (t: Template): Promise<void> => {
      const newIsPrivate = !t.is_private;
      try {
        await updateTemplateVisibility(t.id, newIsPrivate);
        toast.success(newIsPrivate ? 'Vorlage ist jetzt privat.' : 'Vorlage wurde veröffentlicht.');
      } catch (e) {
        toast.error('Fehler beim Ändern der Sichtbarkeit: ' + errText(e));
      }
    },
    [updateTemplateVisibility]
  );

  const remove = useCallback(
    async (t: Template): Promise<void> => {
      if (!window.confirm(`Möchtest du die Vorlage "${t.title}" wirklich löschen?`)) return;
      try {
        await deleteTemplate(t.id);
        toast.success('Vorlage wurde gelöscht.');
      } catch (e) {
        toast.error('Fehler beim Löschen: ' + errText(e));
      }
    },
    [deleteTemplate]
  );

  const getActions = useCallback(
    (t: Template): TemplateAction[] => {
      const actions: TemplateAction[] = [
        { label: 'Bearbeiten', icon: HiOutlinePencil, onClick: () => onEdit(t) },
      ];
      if (isCanvasEditorType(t) || externalUrl(t)) {
        actions.push({
          label: 'Öffnen',
          icon: HiExternalLink,
          onClick: () => void openTemplate(t),
        });
      }
      actions.push({
        label: t.is_private ? 'Veröffentlichen' : 'Privat machen',
        icon: t.is_private ? HiOutlineEye : HiOutlineEyeOff,
        onClick: () => void toggleVisibility(t),
      });
      actions.push({
        label: 'Löschen',
        icon: HiOutlineTrash,
        onClick: () => void remove(t),
        danger: true,
      });
      return actions;
    },
    [onEdit, openTemplate, toggleVisibility, remove]
  );

  return { query, openTemplate, getActions, updateTemplate };
};
