import { useMessage } from '@assistant-ui/react';
import { memo, useMemo, useCallback } from 'react';
import { FaFileWord } from 'react-icons/fa';
import { HiChip } from 'react-icons/hi';

import ActionButtons from '../../../components/common/ActionButtons';
import { CitationSourcesDisplay, CitationTextRenderer } from '../../../components/common/Citation';
import { Markdown } from '../../../components/common/Markdown';
import { useExportStore } from '../../../stores/core/exportStore';

import type { LinkConfig } from '../../../stores/citationStore';
import type { NotebookMessageMetadata } from '@gruenerator/chat';

import '../../../assets/styles/features/qa/qa-mobile-message.css';
import '../../../assets/styles/common/markdown-styles.css';

function NotebookAssistantMessageInner() {
  const message = useMessage();
  const meta = message.metadata?.custom as NotebookMessageMetadata | undefined;
  const isRunning = message.status?.type === 'running';
  const generateNotebookDOCX = useExportStore((state) => state.generateNotebookDOCX);

  const text = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');

  const hasCitations = !isRunning && meta && (meta.citations?.length ?? 0) > 0;
  const hasSources =
    hasCitations && ((meta.sources?.length ?? 0) > 0 || (meta.additionalSources?.length ?? 0) > 0);

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

  const hasResultData = hasCitations && meta;

  return (
    <div
      className={`chat-message assistant${hasResultData ? ' chat-message-with-result' : ''}${isRunning ? ' chat-message-streaming' : ''}`}
    >
      <HiChip className="assistant-icon" />

      {hasResultData ? (
        <div className="qa-mobile-result-content">
          {}
          <CitationTextRenderer
            text={text}
            citations={meta.citations as any}
            className="qa-mobile-message-text"
            linkConfig={meta.linkConfig as LinkConfig}
          />
          {hasSources && (
            <CitationSourcesDisplay
              sources={meta.sources as any}
              citations={meta.citations as any}
              additionalSources={meta.additionalSources as any}
              linkConfig={meta.linkConfig as LinkConfig}
              title="Quellen"
              className="qa-mobile-citation-sources"
            />
          )}
          <ActionButtons
            generatedContent={text}
            title={meta.question}
            showExportDropdown={true}
            showUndo={false}
            showRedo={false}
            className="qa-message-actions"
            customExportOptions={customExportOptions}
          />
        </div>
      ) : (
        <div className="chat-message-content">
          <Markdown fallback={<span>{text}</span>}>{text}</Markdown>
          {isRunning && <span className="streaming-cursor">▋</span>}
        </div>
      )}
    </div>
  );
}

export const NotebookAssistantMessage = memo(NotebookAssistantMessageInner);
