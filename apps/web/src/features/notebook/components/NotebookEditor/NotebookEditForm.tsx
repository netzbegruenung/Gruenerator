import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  SectionHeader,
  Separator,
} from '@gruenerator/ui';
import { motion } from 'motion/react';
import { HiUpload } from 'react-icons/hi';

import NotebookEditorDocsSection from '../NotebookEditorDocsSection';
import NotebookEditorWolkeSection from '../NotebookEditorWolkeSection';

import DocumentCard from './DocumentCard';
import LabelsField from './LabelsField';
import { ACCEPTED_EXTENSIONS, MAX_DOCUMENTS } from './shared';
import type { NotebookEditorStateBundle } from './useNotebookEditorState';

interface NotebookEditFormProps {
  state: NotebookEditorStateBundle;
}

export default function NotebookEditForm({ state }: NotebookEditFormProps) {
  const {
    uploadedDocuments,
    wolkeDocuments,
    manualDocuments,
    wolkeFolders,
    setWolkeFolders,
    isUploading,
    isDragOver,
    uploadError,
    indexingDocIds,
    loading,
    watchedName,
    fileInputRef,
    handleFileSelect,
    handleDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleRemoveDocument,
    handleWolkeDocsImported,
    handleDocsImported,
    handleSubmit,
    onSubmit,
    linkedDocs,
    setLinkedDocs,
  } = state;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-lg">
        <LabelsField state={state} />

        <NotebookEditorWolkeSection
          folders={wolkeFolders}
          onFoldersChange={setWolkeFolders}
          remainingSlots={MAX_DOCUMENTS - uploadedDocuments.length}
          onDocsImported={handleWolkeDocsImported}
          disabled={loading || isUploading}
        />

        <NotebookEditorDocsSection
          linkedDocs={linkedDocs}
          onLinkedDocsChange={setLinkedDocs}
          remainingSlots={MAX_DOCUMENTS - uploadedDocuments.length}
          onDocsImported={handleDocsImported}
          onUploadedDocumentRemoved={handleRemoveDocument}
          disabled={loading || isUploading}
        />

        {wolkeDocuments.length > 0 && (
          <section>
            <SectionHeader
              title="Wolke Dokumente"
              actions={<span className="text-sm text-grey-500">{wolkeDocuments.length}</span>}
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
            </div>
          </section>
        )}

        <section
          className="relative"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <SectionHeader
            title="Dokumente"
            onCreate={() => fileInputRef.current?.click()}
            createLabel="Dokumente hinzufügen"
            actions={
              <span className="text-sm text-grey-500">
                {manualDocuments.length}/{MAX_DOCUMENTS}
              </span>
            }
          />

          {manualDocuments.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Noch keine Dokumente</EmptyTitle>
                <EmptyDescription>Ziehe Dateien hierher oder klicke auf +.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
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
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-sm rounded-xl border-2 border-dashed border-primary-500 bg-primary-500/10 backdrop-blur-[2px]">
              <HiUpload className="text-primary-700 dark:text-primary-300" />
              <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                Dateien hier ablegen
              </span>
            </div>
          )}
        </section>

        <Separator />
        <div className="flex flex-wrap justify-end gap-sm">
          <Button
            type="submit"
            disabled={loading || uploadedDocuments.length === 0 || !watchedName.trim()}
          >
            {loading ? 'Wird gespeichert...' : 'Aktualisieren'}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
