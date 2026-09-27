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
    wordpressDocuments,
    linkedDocs,
    labels,
    uploadedDocuments,
    failedDocs,
    indexingDocIds,
    loading,
    handleBack,
    submitForm,
  } = state;

  // A notebook whose every source failed to be read cannot answer anything, so
  // creating it just produces a broken notebook the user has to debug later.
  // Documents still indexing do NOT block: that finishes server-side either way,
  // and the notebook page shows the progress.
  const usableDocuments = uploadedDocuments.filter((doc) => !failedDocs.has(doc.id));
  const indexingCount = uploadedDocuments.filter((doc) => indexingDocIds.has(doc.id)).length;

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
              {wordpressDocuments.length > 0 && `, ${wordpressDocuments.length} von WordPress`}
            </span>
          </div>
          {/* The summary line above counts what was added, not what is readable.
              Without this, a review page listing "5 eigene" gave no hint that
              two of them could not be read. */}
          {(indexingCount > 0 || failedDocs.size > 0) && (
            <p className="m-0 text-sm text-grey-500">
              {usableDocuments.length} von {uploadedDocuments.length} Quellen bereit
              {indexingCount > 0 && `, ${indexingCount} wird noch indexiert`}
              {failedDocs.size > 0 && `, ${failedDocs.size} nicht lesbar`}.
            </p>
          )}
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
        </CardContent>
      </Card>

      <div className="flex justify-end gap-sm">
        <Button type="button" variant="ghost" onClick={handleBack} disabled={loading}>
          ← Zurück
        </Button>
        <Button
          type="button"
          onClick={submitForm}
          disabled={loading || usableDocuments.length === 0 || !watchedName.trim()}
        >
          {loading ? 'Wird erstellt…' : 'Notebook erstellen'}
        </Button>
      </div>
    </div>
  );
}
