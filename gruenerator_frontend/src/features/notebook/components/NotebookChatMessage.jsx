import React, { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { HiChip } from 'react-icons/hi';
import { CitationSourcesDisplay, CitationTextRenderer } from '../../../components/common/Citation';
import ActionButtons from '../../../components/common/ActionButtons';
import '../../../assets/styles/features/notebook/notebook-mobile-message.css';
import '../../../assets/styles/common/markdown-styles.css';

const ReactMarkdown = lazy(() => import('react-markdown'));

const NotebookChatMessage = ({ msg, index }) => {
  const hasResultData = msg.type === 'assistant' && msg.resultData;

  const hasSources = hasResultData && (
    (msg.resultData.sources?.length > 0) ||
    (msg.resultData.additionalSources?.length > 0)
  );

  return (
    <motion.div
      key={msg.timestamp || index}
      className={`chat-message ${msg.type}${hasResultData ? ' chat-message-with-result' : ''}`}
      initial={{ opacity: 0, y: 2, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -1, scale: 0.995, transition: { duration: 0.2, ease: "easeOut" } }}
      transition={{ type: "tween", ease: "easeOut", duration: 0.35 }}
    >
      {msg.type === 'user' && msg.userName && (
        <div className="chat-message-user-name">{msg.userName}</div>
      )}
      {msg.type === 'assistant' && <HiChip className="assistant-icon" />}

      {hasResultData ? (
        <div className="qa-mobile-result-content">
          <CitationTextRenderer
            text={msg.content}
            citations={msg.resultData.citations}
            className="qa-mobile-message-text"
          />
          {hasSources && (
            <CitationSourcesDisplay
              sources={msg.resultData.sources}
              citations={msg.resultData.citations}
              additionalSources={msg.resultData.additionalSources}
              linkConfig={msg.resultData.linkConfig}
              title="Quellen"
              className="qa-mobile-citation-sources"
            />
          )}
          <ActionButtons
            generatedContent={msg.content}
            title={msg.resultData.question}
            showExportDropdown={true}
            showUndo={false}
            showRedo={false}
            className="qa-message-actions"
          />
        </div>
      ) : (
        <div className="chat-message-content">
          <Suspense fallback={<span>{msg.content}</span>}>
            <ReactMarkdown
              components={{
                a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </Suspense>
        </div>
      )}
    </motion.div>
  );
};

export default NotebookChatMessage;
