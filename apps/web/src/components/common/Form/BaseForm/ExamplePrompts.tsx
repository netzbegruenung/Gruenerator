import React, { memo } from 'react';
import { motion } from 'motion/react';
import type { ExamplePromptsProps, ExamplePrompt } from '@/types/baseform';
import './ExamplePrompts.css';

const ExamplePrompts: React.FC<ExamplePromptsProps> = ({
  prompts = [],
  onPromptClick,
  className = ''
}) => {
  if (!prompts || prompts.length === 0) {
    return null;
  }

  const handlePromptClick = (prompt: ExamplePrompt): void => {
    onPromptClick?.(prompt);
  };

  return (
    <motion.div
      className={`example-prompts ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
    >
      {prompts.map((prompt, index) => (
        <button
          key={index}
          type="button"
          className="example-prompts__button"
          onClick={() => handlePromptClick(prompt)}
        >
          {prompt.icon && <span className="example-prompts__icon">{prompt.icon}</span>}
          <span className="example-prompts__text">{prompt.label || prompt.text}</span>
        </button>
      ))}
    </motion.div>
  );
};

ExamplePrompts.displayName = 'ExamplePrompts';

export default memo(ExamplePrompts);
