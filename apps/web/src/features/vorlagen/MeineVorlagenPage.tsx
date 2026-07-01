import { Button } from '@gruenerator/ui';
import { useCallback, useMemo, useState } from 'react';
import { HiOutlineTemplate, HiPlus } from 'react-icons/hi';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import FavoriteVorlagenSection from './components/FavoriteVorlagenSection';
import VorlagenListSection from './components/VorlagenListSection';
import { useTemplateActions } from './hooks/useTemplateActions';
import { isCanvasEditorType, isGrueneratorType, type Template } from './types';

import AddTemplateModal from '@/components/common/AddTemplateModal/AddTemplateModal';
import EditTemplateModal from '@/components/common/EditTemplateModal';
import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import PageContainer from '@/components/common/PageContainer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { SHOW_CANVAS_EDITOR } from '@/config/featureFlags';

const MeineVorlagenPage = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const { query, openTemplate, getActions, updateTemplate } = useTemplateActions({
    onEdit: setEditingTemplate,
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

  const handleAddSuccess = useCallback(() => {
    void query.refetch();
    toast.success('Vorlage wurde hinzugefügt.');
    setShowAddModal(false);
  }, [query]);

  const handleEditSuccess = useCallback(() => {
    void query.refetch();
    toast.success('Vorlage wurde aktualisiert.');
  }, [query]);

  return (
    <ErrorBoundary>
      <PageContainer maxWidth="lg">
        <div className="mb-lg pt-md text-center">
          <h1 className="mb-xs text-4xl font-semibold text-foreground-heading max-md:text-2xl">
            Meine Vorlagen
          </h1>
          <p className="mx-auto mb-lg max-w-[640px] text-foreground opacity-80">
            {SHOW_CANVAS_EDITOR
              ? 'Verwalte deine Canvas-Editor- und Canva-Vorlagen an einem Ort.'
              : 'Verwalte deine Canva-Vorlagen an einem Ort.'}
          </p>
          {!isEmpty && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="brand" size="brand" onClick={() => setShowAddModal(true)}>
                <HiPlus className="size-5" />
                Vorlage hinzufügen
              </Button>
              <Button asChild variant="brand-outline" size="brand">
                <Link to="/vorlagen">Zur Galerie</Link>
              </Button>
            </div>
          )}
        </div>

        <FavoriteVorlagenSection />

        {isEmpty ? (
          <div className="mx-auto max-w-[480px] rounded-lg border border-dashed border-grey-200 px-6 py-12 text-center dark:border-grey-700">
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
              <Button variant="brand" size="brand" onClick={() => setShowAddModal(true)}>
                <HiPlus className="size-5" />
                Vorlage hinzufügen
              </Button>
              <Button asChild variant="brand-outline" size="brand">
                <Link to="/vorlagen">Galerie durchsuchen</Link>
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

        <AddTemplateModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />

        {editingTemplate && (
          <EditTemplateModal
            isOpen={true}
            onClose={() => setEditingTemplate(null)}
            onSave={handleSave}
            onSuccess={handleEditSuccess}
            template={editingTemplate}
          />
        )}
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(MeineVorlagenPage, { title: 'Meine Vorlagen' });
