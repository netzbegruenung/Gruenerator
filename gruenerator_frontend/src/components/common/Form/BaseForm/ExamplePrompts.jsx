import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import './ExamplePrompts.css';

const ExamplePrompts = ({
  prompts = [],
  onPromptClick,
  className = ''
}) => {
  if (!prompts || prompts.length === 0) {
    return null;
  }

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
          onClick={() => onPromptClick && onPromptClick(prompt)}
        >
          {prompt.icon && <span className="example-prompts__icon">{prompt.icon}</span>}
          <span className="example-prompts__text">{prompt.label || prompt.text}</span>
        </button>
      ))}
    </motion.div>
  );
};

ExamplePrompts.propTypes = {
  prompts: PropTypes.arrayOf(PropTypes.shape({
    icon: PropTypes.string,
    label: PropTypes.string,
    text: PropTypes.string,
    prompt: PropTypes.string,
    platforms: PropTypes.arrayOf(PropTypes.string)
  })),
  onPromptClick: PropTypes.func,
  className: PropTypes.string
};

ExamplePrompts.displayName = 'ExamplePrompts';

export default React.memo(ExamplePrompts);
