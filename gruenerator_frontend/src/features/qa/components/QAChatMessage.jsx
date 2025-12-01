import React, { lazy, Suspense, useCallback } from 'react';
import { motion } from 'motion/react';
import { HiChip } from 'react-icons/hi';
import FormStateProvider from '../../../components/common/Form/FormStateProvider';
import DisplaySection from '../../../components/common/Form/BaseForm/DisplaySection';
import { CitationSourcesDisplay } from '../../../components/common/Citation';
import '../../../assets/styles/features/qa/qa-mobile-message.css';

const ReactMarkdown = lazy(() => import('react-markdown'));

const QAChatMessage = ({ msg, index, viewMode, assistantName }) => {
  const hasResultData = msg.type === 'assistant' && msg.resultData;

  const getExportableContent = useCallback(() => {
    return msg.content || '';
  }, [msg.content]);

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
      {msg.type === 'assistant' && viewMode === 'chat' && assistantName && (
        <div className="chat-message-user-name">{assistantName}</div>
      )}
      {msg.type === 'assistant' && <HiChip className="assistant-icon" />}

      {hasResultData ? (
        <div className="qa-mobile-result-content">
          <FormStateProvider formId={`qa-mobile-${msg.resultData.resultId}`}>
            <DisplaySection
              value={msg.content}
              generatedContent={msg.content}
              useMarkdown={true}
              componentName={msg.resultData.resultId}
              getExportableContent={getExportableContent}
              showEditModeToggle={false}
              showUndoControls={false}
              showRedoControls={false}
            />
          </FormStateProvider>
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

export default QAChatMessage;
