import { Button } from '@gruenerator/ui';
import { useCallback, useMemo, useState } from 'react';
import { HiOutlineTemplate, HiPlus } from 'react-icons/hi';
import { toast } from 'sonner';

import { useTemplateActions } from '../hooks/useTemplateActions';
import { isCanvasEditorType, isGrueneratorType, type Template } from '../types';

import FavoriteVorlagenSection from './FavoriteVorlagenSection';
import { ShareVorlageDialog } from './ShareVorlageDialog';
import VorlagenListSection from './VorlagenListSection';

import EditTemplateModal from '@/components/common/EditTemplateModal';
import { SHOW_CANVAS_EDITOR } from '@/config/featureFlags';

interface MeineVorlagenPanelProps {
  onAdd: () => void;
  onBrowse: () => void;
}

export function MeineVorlagenPanel({ onAdd, onBrowse }: MeineVorlagenPanelProps) {
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [sharingTemplate, setSharingTemplate] = useState<Template | null>(null);

  const { query, openTemplate, getActions, updateTemplate } = useTemplateActions({
    onEdit: setEditingTemplate,
    onShare: setSharingTemplate,
  });

  const { gruenerator, canvasEditor, canva } = useMemo(() => {
    const templates = (query.data ?? []) as Template[];
    const gruenerator: Template[] = [];
    const canvasEditor: Template[] = [];
    const canva: Template[] = [];
    for (const t of templates) {
      if (isGrueneratorType(t)) gruenerator.push(t);
      else if (isCanvasEditorType(t)) canvasEditor.push(t);
      else canva.push(t);
    }
    return { gruenerator, canvasEditor, canva };
  }, [query.data]);

  const isEmpty =
    !query.isLoading &&
    canva.length === 0 &&
    gruenerator.length === 0 &&
    (!SHOW_CANVAS_EDITOR || canvasEditor.length === 0);

  const handleSave = useCallback(
    async (id: string, data: Partial<Template>): Promise<void> => {
      await updateTemplate(id, data);
    },
    [updateTemplate]
  );

  const handleEditSuccess = useCallback(() => {
    void query.refetch();
    toast.success('Vorlage wurde aktualisiert.');
  }, [query]);

  return (
    <>
      <FavoriteVorlagenSection />

      {isEmpty ? (
        <div className="mx-auto w-full max-w-[480px] rounded-lg border border-dashed border-grey-200 px-6 py-12 text-center dark:border-grey-700">
          <div className="mb-4 flex justify-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-background-alt text-foreground">
              <HiOutlineTemplate className="size-6" />
            </div>
          </div>
          <h2 className="text-lg font-medium text-foreground-heading">Noch keine Vorlagen</h2>
          <p className="mx-auto mt-2 text-sm leading-relaxed text-foreground opacity-70">
            {SHOW_CANVAS_EDITOR
              ? 'Speichere Canva-Links oder erstelle Vorlagen im Canvas-Editor, um sie hier an einem Ort zu verwalten.'
              : 'Speichere Canva-Links, um sie hier an einem Ort zu verwalten.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="brand" size="brand" onClick={onAdd}>
              <HiPlus className="size-5" />
              Vorlage hinzufügen
            </Button>
            <Button variant="brand-outline" size="brand" onClick={onBrowse}>
              Galerie durchsuchen
            </Button>
          </div>
        </div>
      ) : (
        <>
          {gruenerator.length > 0 && (
            <VorlagenListSection
              title="Grünerator-Vorlagen"
              items={gruenerator}
              loading={query.isLoading}
              emptyMessage="Du hast noch keine Grünerator-Vorlagen veröffentlicht."
              getActions={getActions}
              onOpen={(t) => void openTemplate(t)}
            />
          )}

          {SHOW_CANVAS_EDITOR && (
            <VorlagenListSection
              title="Canvas-Editor Vorlagen"
              items={canvasEditor}
              loading={query.isLoading}
              emptyMessage="Du hast noch keine Canvas-Editor-Vorlagen gespeichert."
              getActions={getActions}
              onOpen={(t) => void openTemplate(t)}
            />
          )}

          <VorlagenListSection
            title="Canva Vorlagen"
            items={canva}
            loading={query.isLoading}
            emptyMessage="Du hast noch keine Canva-Vorlagen gespeichert. Füge oben eine über „Vorlage hinzufügen“ hinzu."
            getActions={getActions}
            onOpen={(t) => void openTemplate(t)}
          />
        </>
      )}

      {sharingTemplate && (
        <ShareVorlageDialog
          template={sharingTemplate}
          open={true}
          onOpenChange={(next) => {
            if (!next) setSharingTemplate(null);
          }}
        />
      )}

      {editingTemplate && (
        <EditTemplateModal
          isOpen={true}
          onClose={() => setEditingTemplate(null)}
          onSave={handleSave}
          onSuccess={handleEditSuccess}
          template={editingTemplate}
        />
      )}
    </>
  );
}
