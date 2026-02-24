import { motion } from 'motion/react';
import React, { memo } from 'react';

import type { ExamplePromptsProps, ExamplePrompt } from '@/types/baseform';

import { cn } from '@/utils/cn';

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
      className={cn(
        'flex flex-wrap gap-sm justify-start mt-md max-w-[720px] w-full max-md:gap-xs',
        className
      )}
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
            className={cn(
              'inline-flex items-center gap-xs px-[18px] py-[10px]',
              'bg-[var(--card-background)] border border-[var(--border-subtle)] rounded-3xl',
              'text-[0.95rem] text-grey-500 cursor-pointer whitespace-nowrap',
              'transition-all duration-200',
              'hover:bg-background-alt hover:border-primary-500 hover:text-foreground hover:-translate-y-px',
              'active:translate-y-0',
              'max-md:text-[0.8rem] max-md:px-[10px] max-md:py-[6px]',
              isSelected &&
                'bg-primary-500 border-primary-500 text-white hover:bg-primary-700 hover:border-primary-700'
            )}
            onClick={() => handlePromptClick(prompt)}
            aria-pressed={isSelected}
          >
            {prompt.icon && (
              <span className="text-base inline-flex items-center justify-center [&_svg]:size-[1em] [&_svg]:fill-current">
                {prompt.icon}
              </span>
            )}
            {(prompt.label || prompt.text) && (
              <span className="font-medium">{prompt.label || prompt.text}</span>
            )}
          </button>
        );
      })}
    </motion.div>
  );
};

ExamplePrompts.displayName = 'ExamplePrompts';

export default memo(ExamplePrompts);
