import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@gruenerator/ui';

import type { NotebookEditorStateBundle } from './useNotebookEditorState';

interface ReviewStepProps {
  state: NotebookEditorStateBundle;
}

export default function ReviewStep({ state }: ReviewStepProps) {
  const {
    watchedName,
    watchedDesc,
    manualDocuments,
    wolkeDocuments,
    linkedDocs,
    labels,
    isPublic,
    publicOwnership,
    uploadedDocuments,
    loading,
    handleBack,
    submitForm,
  } = state;

  return (
    <div className="flex flex-col gap-lg">
      <Card>
        <CardHeader>
          <CardTitle>{watchedName || 'Notebook'}</CardTitle>
          {watchedDesc && <CardDescription>{watchedDesc}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-md">
          <div className="flex items-center justify-between text-sm">
            <span className="text-grey-500">Dokumente</span>
            <span className="font-medium text-foreground">
              {manualDocuments.length} eigene
              {wolkeDocuments.length > 0 && `, ${wolkeDocuments.length} aus der Wolke`}
              {linkedDocs.length > 0 && `, ${linkedDocs.length} aus Docs`}
            </span>
          </div>
          {labels.length > 0 && (
            <div>
              <p className="mb-xs text-sm text-grey-500">Labels</p>
              <div className="flex flex-wrap gap-xs">
                {labels.map((l) => (
                  <Badge
                    key={l}
                    variant="secondary"
                    className="border-transparent bg-secondary-600 text-xs text-white"
                  >
                    {l}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-grey-500">Sichtbarkeit</span>
            <span className="font-medium text-foreground">
              {!isPublic
                ? 'Privat'
                : publicOwnership === 'owner'
                  ? 'Öffentlich (eigene Daten)'
                  : 'Öffentlich (öffentliche Daten)'}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-sm">
        <Button type="button" variant="ghost" onClick={handleBack} disabled={loading}>
          ← Zurück
        </Button>
        <Button
          type="button"
          onClick={submitForm}
          disabled={
            loading ||
            uploadedDocuments.length === 0 ||
            !watchedName.trim() ||
            (isPublic && !publicOwnership)
          }
        >
          {loading ? 'Wird erstellt…' : 'Notebook erstellen'}
        </Button>
      </div>
    </div>
  );
}
