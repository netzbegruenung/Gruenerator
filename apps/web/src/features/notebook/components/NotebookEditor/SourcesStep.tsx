import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  SectionHeader,
} from '@gruenerator/ui';
import { HiCloud, HiUpload } from 'react-icons/hi';

import { cn } from '../../../../utils/cn';

import NotebookEditorWolkeSection from '../NotebookEditorWolkeSection';

import DocumentCard from './DocumentCard';
import { ACCEPTED_EXTENSIONS, MAX_DOCUMENTS } from './shared';
import type { NotebookEditorStateBundle } from './useNotebookEditorState';

interface SourcesStepProps {
  state: NotebookEditorStateBundle;
}

export default function SourcesStep({ state }: SourcesStepProps) {
  const {
    uploadedDocuments,
    wolkeFolders,
    wolkePanelOpen,
    setWolkePanelOpen,
    setWolkeFolders,
    isUploading,
    isDragOver,
    uploadError,
    indexingDocIds,
    loading,
    wolkeDocuments,
    manualDocuments,
    fileInputRef,
    handleFileSelect,
    handleDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleRemoveDocument,
    handleWolkeDocsImported,
    handleCancel,
    handleNext,
    canAdvanceFromSources,
  } = state;

  return (
    <div
      className="flex flex-col gap-lg"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <button
          type="button"
          onClick={() => !isUploading && fileInputRef.current?.click()}
          disabled={isUploading}
          className={cn(
            'group flex min-h-[180px] flex-col items-center justify-center gap-sm rounded-xl border-2 border-dashed bg-background-alt p-lg text-center transition-all',
            isDragOver
              ? 'border-primary-500 bg-green-50 dark:bg-secondary-900'
              : 'border-grey-300 hover:border-primary-500 hover:bg-background dark:border-grey-600',
            isUploading && 'cursor-default opacity-85'
          )}
        >
          {isUploading ? (
            <>
              <div className="size-7 animate-spin rounded-full border-3 border-grey-200 border-t-primary-500" />
              <span className="text-sm text-grey-500">Wird hochgeladen…</span>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center rounded-xl bg-primary-50 p-md text-primary-600 transition-colors group-hover:bg-primary-100 dark:bg-primary-950/30 dark:text-primary-400">
                <HiUpload size={28} />
              </div>
              <div>
                <p className="m-0 text-base font-semibold text-foreground">Dateien hochladen</p>
                <p className="mt-xs m-0 text-xs text-grey-500">
                  PDF, DOCX, TXT, MD, ODT, RTF · bis zu {MAX_DOCUMENTS} Dateien
                </p>
              </div>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setWolkePanelOpen(!wolkePanelOpen)}
          className={cn(
            'group flex min-h-[180px] flex-col items-center justify-center gap-sm rounded-xl border-2 p-lg text-center transition-all',
            wolkePanelOpen
              ? 'border-secondary-500 bg-secondary-50 dark:border-secondary-600 dark:bg-secondary-950/30'
              : 'border-grey-200 hover:border-secondary-400 hover:bg-background-alt dark:border-grey-700'
          )}
        >
          <div className="flex items-center justify-center rounded-xl bg-secondary-50 p-md text-secondary-600 transition-colors group-hover:bg-secondary-100 dark:bg-secondary-950/40 dark:text-secondary-400">
            <HiCloud size={28} />
          </div>
          <div>
            <p className="m-0 text-base font-semibold text-foreground">Aus der Wolke verbinden</p>
            <p className="mt-xs m-0 text-xs text-grey-500">
              Ordner aus der Grünen Wolke als Quelle nutzen
            </p>
          </div>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      {wolkePanelOpen && (
        <div className="rounded-xl border border-grey-200 bg-background p-md dark:border-grey-800">
          <NotebookEditorWolkeSection
            folders={wolkeFolders}
            onFoldersChange={setWolkeFolders}
            remainingSlots={MAX_DOCUMENTS - uploadedDocuments.length}
            onDocsImported={handleWolkeDocsImported}
            disabled={loading || isUploading}
          />
        </div>
      )}

      {uploadedDocuments.length > 0 ? (
        <section className="space-y-md">
          <SectionHeader
            title="Hinzugefügte Dokumente"
            actions={
              <span className="text-sm text-grey-500">
                {uploadedDocuments.length}/{MAX_DOCUMENTS}
              </span>
            }
          />
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {wolkeDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                indexing={indexingDocIds.has(doc.id)}
                loading={loading}
                onRemove={handleRemoveDocument}
              />
            ))}
            {manualDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                indexing={indexingDocIds.has(doc.id)}
                loading={loading}
                onRemove={handleRemoveDocument}
              />
            ))}
          </div>
        </section>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Noch keine Dokumente</EmptyTitle>
            <EmptyDescription>Wähle oben eine Quelle, um loszulegen.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {isDragOver && (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center bg-primary-500/5">
          <div className="flex items-center gap-sm rounded-xl border-2 border-dashed border-primary-500 bg-background px-lg py-md shadow-lg">
            <HiUpload className="text-primary-700 dark:text-primary-300" />
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
              Dateien hier ablegen
            </span>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-sm">
        <Button type="button" variant="ghost" onClick={handleCancel} disabled={loading}>
          Abbrechen
        </Button>
        <Button type="button" onClick={handleNext} disabled={!canAdvanceFromSources || isUploading}>
          Weiter →
        </Button>
      </div>
    </div>
  );
}
