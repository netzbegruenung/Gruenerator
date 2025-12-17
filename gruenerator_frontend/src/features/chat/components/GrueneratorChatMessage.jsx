import React, { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { HiChip } from 'react-icons/hi';
import ActionButtons from '../../../components/common/ActionButtons';
import ImageDisplay from '../../../components/common/ImageDisplay';
import '../../../assets/styles/components/chat/gruenerator-message.css';

const ReactMarkdown = lazy(() => import('react-markdown'));

const GrueneratorChatMessage = ({ msg, index, onEditRequest, isEditModeActive, activeResultId }) => {
  const hasResultData = msg.type === 'assistant' && msg.resultData;
  const isActive = hasResultData && msg.resultData?.componentId === activeResultId;

  return (
    <motion.div
      key={msg.timestamp || index}
      className={`chat-message ${msg.type}${hasResultData ? ' chat-message-with-result' : ''}${isActive ? ' editing' : ''}`}
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
        <div className="gruenerator-result-content">
          {msg.resultData.sharepic && (
            <ImageDisplay
              sharepicData={msg.resultData.sharepic}
              minimal={true}
              className="gruenerator-result-sharepic"
            />
          )}
          <Suspense fallback={<span>{msg.resultData.text}</span>}>
            <ReactMarkdown
              components={{
                a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />
              }}
            >
              {msg.resultData.text}
            </ReactMarkdown>
          </Suspense>
          <ActionButtons
            generatedContent={msg.resultData.text}
            showEditMode={true}
            onRequestEdit={() => onEditRequest?.(msg.resultData.componentId)}
            isEditModeActive={isActive && isEditModeActive}
            showExportDropdown={true}
            showUndo={false}
            showRedo={false}
            className="gruenerator-message-actions"
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

export default GrueneratorChatMessage;
