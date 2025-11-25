import React from 'react';
import PropTypes from 'prop-types';

const ChatActionButtons = ({ actions, onAction, disabled }) => {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="chat-action-buttons">
      {actions.map((action, index) => (
        <button
          key={index}
          className={`chat-action-btn chat-action-btn--${action.style || 'default'}`}
          onClick={() => onAction(action)}
          disabled={disabled}
          type="button"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
};

ChatActionButtons.propTypes = {
  actions: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
    style: PropTypes.oneOf(['primary', 'secondary', 'default'])
  })),
  onAction: PropTypes.func.isRequired,
  disabled: PropTypes.bool
};

ChatActionButtons.defaultProps = {
  actions: [],
  disabled: false
};

export default ChatActionButtons;
