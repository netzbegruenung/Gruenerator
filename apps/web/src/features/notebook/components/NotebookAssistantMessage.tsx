import { useMessage } from '@assistant-ui/react';
import {
  CitationProvider,
  MarkdownContent,
  ProgressIndicator,
  SearchResultsSection,
  TypingIndicator,
  type AdditionalSource,
  type Citation as ChatCitation,
  type NotebookMessageMetadata,
} from '@gruenerator/chat';
import { memo, useMemo, useCallback, useState, useEffect, startTransition } from 'react';
import { FaFileWord } from 'react-icons/fa';
import { HiChip } from 'react-icons/hi';

import ActionButtons from '../../../components/common/ActionButtons';
import { useExportStore } from '../../../stores/core/exportStore';

function mapRawCitationsToChat(raw: unknown[]): ChatCitation[] {
  return raw
    .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object' && 'index' in c)
    .map((c) => ({
      id: parseInt(String(c.index), 10),
      title: (c.document_title as string) ?? '',
      url: (c.source_url as string) ?? '',
      snippet: (c.cited_text as string) ?? '',
      citedText: c.cited_text as string | undefined,
      source: (c.collection_name as string) ?? '',
      collectionName: c.collection_name as string | undefined,
      documentId: c.document_id as string | undefined,
      chunkIndex: c.chunk_index as number | undefined,
      similarityScore: c.similarity_score as number | undefined,
      collectionId: c.collection_id as string | undefined,
    }));
}

function NotebookAssistantMessageInner() {
  const message = useMessage();
  const meta = message.metadata?.custom as NotebookMessageMetadata | undefined;
  const isRunning = message.status?.type === 'running';
  const generateNotebookDOCX = useExportStore((state) => state.generateNotebookDOCX);

  const text = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');

  const progress = meta?.progress;
  const hasCitations = !isRunning && meta && (meta.citations?.length ?? 0) > 0;

  const handleNotebookDOCXExport = useCallback(async () => {
    if (!hasCitations || !meta) return;

    await generateNotebookDOCX(
      text,
      meta.question || 'Notebook-Antwort',
      (meta.citations || []) as any,
      (meta.sources || []) as any
    );
  }, [text, meta, hasCitations, generateNotebookDOCX]);

  const customExportOptions = useMemo(() => {
    if (!hasCitations) return [];
    return [
      {
        id: 'notebook-docx',
        label: 'Word mit Quellen',
        subtitle: 'Inkl. Quellenangaben',
        icon: <FaFileWord size={16} />,
        onClick: handleNotebookDOCXExport,
      },
    ];
  }, [hasCitations, handleNotebookDOCXExport]);

  const mappedCitations = useMemo(() => {
    if (!hasCitations || !meta) return [];
    let result: ChatCitation[];
    if (meta.chatCitations && meta.chatCitations.length > 0) {
      result = meta.chatCitations;
    } else if (meta.citations && meta.citations.length > 0) {
      result = mapRawCitationsToChat(meta.citations);
    } else {
      return [];
    }
    console.debug(
      '[Notebook] Citations: chatCitations=%d, raw=%d, mapped=%d',
      meta.chatCitations?.length ?? 0,
      meta.citations?.length ?? 0,
      result.length
    );
    return result;
  }, [hasCitations, meta]);

  // Defer heavy SearchResultsSection render so answer text paints first
  const [showSearchResults, setShowSearchResults] = useState(false);
  useEffect(() => {
    if (!isRunning && mappedCitations.length > 0) {
      startTransition(() => setShowSearchResults(true));
    } else {
      setShowSearchResults(false);
    }
  }, [isRunning, mappedCitations.length]);

  return (
    <div className="group flex w-full items-start gap-4">
      <HiChip className="mt-1 size-6 shrink-0 text-grey-500" />

      <div className="min-w-0 flex-1">
        {isRunning &&
          !text &&
          (progress?.stage === 'searching' || progress?.stage === 'generating' ? (
            <ProgressIndicator progress={progress} agentColor="#316049" />
          ) : (
            <TypingIndicator />
          ))}

        <CitationProvider citations={mappedCitations}>
          <div className="prose prose-sm max-w-none">
            <MarkdownContent content={text} />
            {isRunning && text && (
              <span className="inline-block animate-pulse text-grey-400">▋</span>
            )}
          </div>
        </CitationProvider>

        {showSearchResults && (
          <SearchResultsSection
            citations={mappedCitations}
            additionalSources={meta?.additionalSources as AdditionalSource[] | undefined}
          />
        )}

        {!isRunning && text && (
          <ActionButtons
            generatedContent={text}
            title={meta?.question}
            showExportDropdown={true}
            showUndo={false}
            showRedo={false}
            className="mt-2"
            customExportOptions={customExportOptions}
          />
        )}
      </div>
    </div>
  );
}

export const NotebookAssistantMessage = memo(NotebookAssistantMessageInner);
