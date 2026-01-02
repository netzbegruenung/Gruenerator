
interface ChatActionButtonsProps {
  actions: 'primary' | 'secondary' | 'default';
  onAction: () => void;
  disabled?: boolean;
}

const ChatActionButtons = ({ actions, onAction, disabled }: ChatActionButtonsProps): JSX.Element => {
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
