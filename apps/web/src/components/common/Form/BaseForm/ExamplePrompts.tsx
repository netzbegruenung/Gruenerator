import { motion } from 'motion/react';
import React, { memo, useMemo } from 'react';

import type { ExamplePromptsProps, ExamplePrompt } from '@/types/baseform';
import './ExamplePrompts.css';

const ExamplePrompts: React.FC<ExamplePromptsProps> = ({
  prompts = [],
  onPromptClick,
  className = '',
  selectedPlatforms = [],
}) => {
  if (!prompts || prompts.length === 0) {
    return null;
  }

  const handlePromptClick = (prompt: ExamplePrompt): void => {
    onPromptClick?.(prompt);
  };

  // Check if a prompt is selected based on its platforms
  const isPromptSelected = (prompt: ExamplePrompt): boolean => {
    if (!prompt.platforms || prompt.platforms.length === 0 || selectedPlatforms.length === 0) {
      return false;
    }
    // A prompt is selected if any of its platforms are in selectedPlatforms
    return prompt.platforms.some((platform) => selectedPlatforms.includes(platform));
  };

  return (
    <motion.div
      className={`example-prompts ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
    >
      {prompts.map((prompt, index) => {
        const isSelected = isPromptSelected(prompt);
        return (
          <button
            key={index}
            type="button"
            className={`example-prompts__button ${isSelected ? 'example-prompts__button--selected' : ''}`}
            onClick={() => handlePromptClick(prompt)}
            aria-pressed={isSelected}
          >
            {prompt.icon && <span className="example-prompts__icon">{prompt.icon}</span>}
            {(prompt.label || prompt.text) && (
              <span className="example-prompts__text">{prompt.label || prompt.text}</span>
            )}
          </button>
        );
      })}
    </motion.div>
  );
};

ExamplePrompts.displayName = 'ExamplePrompts';

export default memo(ExamplePrompts);
