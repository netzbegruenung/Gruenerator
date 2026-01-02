import type { JSX, FormEvent, ReactNode } from 'react';
import { BsArrowUpCircleFill } from 'react-icons/bs';
import { FaMicrophone, FaStop } from 'react-icons/fa';

interface ChatSubmitButtonProps {
  inputValue?: string;
  isVoiceRecording?: boolean;
  isVoiceProcessing?: boolean;
  onSubmit?: (event: React.FormEvent) => void;
  startRecording?: () => void;
  stopRecording?: () => void;
  disabled?: boolean;
  submitIcon?: ReactNode;
  iconSize?: number;
  className?: string;
}

const ChatSubmitButton = ({ inputValue = '',
  isVoiceRecording = false,
  isVoiceProcessing = false,
  onSubmit,
  startRecording,
  stopRecording,
  disabled = false,
  submitIcon = null,
  iconSize = 18,
  className = '' }: ChatSubmitButtonProps): JSX.Element => {
  const hasText = (inputValue || '').trim();

  const handleClick = () => {
    if (hasText) {
      onSubmit?.({ preventDefault: () => {} } as React.FormEvent);
    } else if (isVoiceRecording) {
      stopRecording?.();
    } else {
      startRecording?.();
    }
  };

  const renderIcon = () => {
    if (isVoiceRecording) return <FaStop size={iconSize} />;
    if (hasText) return submitIcon || <BsArrowUpCircleFill size={iconSize} />;
    return <FaMicrophone size={iconSize} />;
  };

  return (
    <button
      type={hasText ? "submit" : "button"}
      onClick={handleClick}
      disabled={disabled || isVoiceProcessing}
      className={`${className} ${isVoiceRecording ? 'voice-recording' : ''}`.trim()}
    >
      {renderIcon()}
    </button>
  );
};

export default ChatSubmitButton;
