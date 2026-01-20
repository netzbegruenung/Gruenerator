import React, { memo, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { HiChip } from 'react-icons/hi';
import { FaFileWord } from 'react-icons/fa';
import { CitationSourcesDisplay, CitationTextRenderer } from '../../../components/common/Citation';
import ActionButtons from '../../../components/common/ActionButtons';
import { Markdown } from '../../../components/common/Markdown';
import { MESSAGE_MOTION_PROPS } from '../../../components/common/Chat/utils/chatMessageUtils';
import { useExportStore } from '../../../stores/core/exportStore';
import type { LinkConfig } from '../../../stores/citationStore';
import '../../../assets/styles/features/qa/qa-mobile-message.css';
import '../../../assets/styles/common/markdown-styles.css';

interface NotebookResultData {
  sources?: Array<{ url?: string; title?: string }>;
  additionalSources?: Array<{ url?: string; title?: string }>;
  citations?: Array<{ id: string; text: string }>;
  question?: string;
  linkConfig?: LinkConfig;
}

interface NotebookMessage {
  type: 'user' | 'assistant' | 'error';
  content: string;
  timestamp?: number;
  userName?: string;
  resultData?: NotebookResultData;
}

const NotebookChatMessage = ({ msg, index }: { msg: NotebookMessage; index: number }) => {
  const hasResultData = msg.type === 'assistant' && msg.resultData;
  const generateNotebookDOCX = useExportStore((state) => state.generateNotebookDOCX);

  const hasSources = hasResultData && (
    ((msg.resultData?.sources?.length ?? 0) > 0) ||
    ((msg.resultData?.additionalSources?.length ?? 0) > 0)
  );

  const hasCitations = hasResultData && (msg.resultData?.citations?.length ?? 0) > 0;

  const handleNotebookDOCXExport = useCallback(async () => {
    if (!hasResultData || !hasCitations || !msg.resultData) return;

    await generateNotebookDOCX(
      msg.content,
      msg.resultData?.question || 'Notebook-Antwort',
      msg.resultData?.citations || [],
      msg.resultData?.sources || []
    );
  }, [msg, hasResultData, hasCitations, generateNotebookDOCX]);

  const customExportOptions = useMemo(() => {
    if (!hasCitations) return [];

    return [{
      id: 'notebook-docx',
      label: 'Word mit Quellen',
      subtitle: 'Inkl. Quellenangaben',
      icon: <FaFileWord size={16} />,
      onClick: handleNotebookDOCXExport
    }];
  }, [hasCitations, handleNotebookDOCXExport]);

  return (
    <motion.div
      key={msg.timestamp || index}
      className={`chat-message ${msg.type}${hasResultData ? ' chat-message-with-result' : ''}`}
      {...MESSAGE_MOTION_PROPS}
    >
      {msg.type === 'user' && msg.userName && (
        <div className="chat-message-user-name">{msg.userName}</div>
      )}
      {msg.type === 'assistant' && <HiChip className="assistant-icon" />}

      {hasResultData && msg.resultData ? (
        <div className="qa-mobile-result-content">
          <CitationTextRenderer
            text={msg.content}
            citations={msg.resultData?.citations}
            className="qa-mobile-message-text"
            linkConfig={msg.resultData?.linkConfig}
          />
          {hasSources && (
            <CitationSourcesDisplay
              sources={msg.resultData?.sources}
              citations={msg.resultData?.citations}
              additionalSources={msg.resultData?.additionalSources}
              linkConfig={msg.resultData?.linkConfig}
              title="Quellen"
              className="qa-mobile-citation-sources"
            />
          )}
          <ActionButtons
            generatedContent={msg.content}
            title={msg.resultData?.question}
            showExportDropdown={true}
            showUndo={false}
            showRedo={false}
            className="qa-message-actions"
            customExportOptions={customExportOptions}
          />
        </div>
      ) : (
        <div className="chat-message-content">
          <Markdown fallback={<span>{msg.content}</span>}>{msg.content}</Markdown>
        </div>
      )}
    </motion.div>
  );
};

export default memo(NotebookChatMessage);
