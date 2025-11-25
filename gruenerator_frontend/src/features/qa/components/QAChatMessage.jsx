import React, { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { HiChip } from 'react-icons/hi';

const ReactMarkdown = lazy(() => import('react-markdown'));

const QAChatMessage = ({ msg, index, viewMode, assistantName }) => (
  <motion.div
    key={msg.timestamp || index}
    className={`chat-message ${msg.type}`}
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
  </motion.div>
);

export default QAChatMessage;
