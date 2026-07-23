import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  FileCard,
  SectionHeader,
  Separator,
} from '@gruenerator/ui';
import { motion } from 'motion/react';
import { HiOutlineDocument, HiUpload } from 'react-icons/hi';

import NotebookEditorDocsSection from '../NotebookEditorDocsSection';
import NotebookEditorWolkeSection from '../NotebookEditorWolkeSection';
import NotebookEditorWordpressSection from '../NotebookEditorWordpressSection';

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
    stagedFiles,
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
    wordpressDocuments,
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

        <NotebookEditorWordpressSection
          sites={wordpressSites}
          onSitesChange={setWordpressSites}
          remainingSlots={MAX_DOCUMENTS - uploadedDocuments.length}
          onDocsImported={handleWordpressDocsImported}
          onUploadedDocumentRemoved={handleRemoveDocument}
          disabled={loading || isUploading}
        />

        {wordpressDocuments.length > 0 && (
          <section>
            <SectionHeader
              title="WordPress Beiträge"
              actions={<span className="text-sm text-grey-500">{wordpressDocuments.length}</span>}
            />
            <div className="grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {wordpressDocuments.map((doc) => (
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
