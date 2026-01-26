import type { JSX } from 'react';

interface ChatAction {
  value: string;
  label?: string;
  style?: 'primary' | 'secondary' | 'default';
}

interface ChatActionButtonsProps {
  actions: ChatAction[];
  onAction: (action: ChatAction) => void;
  disabled?: boolean;
}

const ChatActionButtons = ({
  actions,
  onAction,
  disabled,
}: ChatActionButtonsProps): JSX.Element | null => {
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

export default ChatActionButtons;
