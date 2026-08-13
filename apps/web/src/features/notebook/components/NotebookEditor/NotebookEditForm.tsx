import { Button, FileCard, SectionHeader, Separator } from '@gruenerator/ui';
import { motion } from 'motion/react';
import { HiOutlineDocument, HiUpload } from 'react-icons/hi';

import NotebookEditorDocsSection from '../NotebookEditorDocsSection';
import NotebookEditorWolkeSection from '../NotebookEditorWolkeSection';
import NotebookEditorWordpressSection from '../NotebookEditorWordpressSection';

import DocumentsPanel from './DocumentsPanel';
import LabelsField from './LabelsField';
import { ACCEPTED_EXTENSIONS } from './shared';

import type { NotebookEditorStateBundle } from './useNotebookEditorState';

interface NotebookEditFormProps {
  state: NotebookEditorStateBundle;
}

export default function NotebookEditForm({ state }: NotebookEditFormProps) {
  const {
    uploadedDocuments,
    documentCount,
    remainingSlots,
    stagedFiles,
    documentsWithSource,
    wolkeFolders,
    setWolkeFolders,
    isUploading,
    isDragOver,
    uploadError,
    indexingDocIds,
    failedDocs,
    loading,
    watchedName,
    fileInputRef,
    handleFileSelect,
    handleDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleRemoveDocument,
    handleRemoveDocuments,
    handleUnstageFile,
    handleCommitStagedUpload,
    handleWolkeDocsImported,
    handleWordpressDocsImported,
    handleDocsImported,
    handleSubmit,
    onSubmit,
    linkedDocs,
    setLinkedDocs,
    wordpressSites,
    setWordpressSites,
  } = state;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-lg">
        <LabelsField state={state} />

        <NotebookEditorWolkeSection
          folders={wolkeFolders}
          onFoldersChange={setWolkeFolders}
          remainingSlots={remainingSlots}
          onDocsImported={handleWolkeDocsImported}
          disabled={loading || isUploading}
        />

        <NotebookEditorDocsSection
          linkedDocs={linkedDocs}
          onLinkedDocsChange={setLinkedDocs}
          remainingSlots={remainingSlots}
          onDocsImported={handleDocsImported}
          onUploadedDocumentRemoved={handleRemoveDocument}
          disabled={loading || isUploading}
        />

        <NotebookEditorWordpressSection
          sites={wordpressSites}
          onSitesChange={setWordpressSites}
          remainingSlots={remainingSlots}
          onDocsImported={handleWordpressDocsImported}
          onUploadedDocumentRemoved={handleRemoveDocument}
          disabled={loading || isUploading}
        />

        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag-tracking wrapper only; DocumentsPanel's add button and the file input below are the keyboard-accessible controls */}
        <section
          className="relative space-y-md"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <DocumentsPanel
            documents={documentsWithSource}
            documentCount={documentCount}
            indexingDocIds={indexingDocIds}
            failedDocs={failedDocs}
            loading={loading}
            onRemove={handleRemoveDocument}
            onRemoveMany={handleRemoveDocuments}
            onAddClick={() => fileInputRef.current?.click()}
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

          {stagedFiles.length > 0 && (
            <div className="mt-md space-y-md">
              <SectionHeader
                title="Bereit zum Hochladen"
                size="sm"
                actions={
                  <span className="text-sm text-grey-500">
                    {stagedFiles.length} Datei{stagedFiles.length === 1 ? '' : 'en'}
                  </span>
                }
              />
              <div className="grid grid-cols-1 gap-sm sm:grid-cols-2 md:grid-cols-3">
                {stagedFiles.map((file, idx) => (
                  <FileCard
                    key={`${file.name}-${file.size}-${idx}`}
                    name={file.name}
                    size={file.size}
                    icon={<HiOutlineDocument size={20} />}
                    onRemove={isUploading ? undefined : () => handleUnstageFile(idx)}
                  />
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => void handleCommitStagedUpload()}
                  disabled={isUploading}
                >
                  {isUploading ? 'Wird hochgeladen…' : `Hochladen (${stagedFiles.length})`}
                </Button>
              </div>
            </div>
          )}

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
