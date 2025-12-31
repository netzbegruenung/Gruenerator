import React from 'react';
import PropTypes from 'prop-types';
import { BsArrowUpCircleFill } from 'react-icons/bs';
import { FaMicrophone, FaStop } from 'react-icons/fa';

const ChatSubmitButton = ({
  inputValue = '',
  isVoiceRecording = false,
  isVoiceProcessing = false,
  onSubmit,
  startRecording,
  stopRecording,
  disabled = false,
  submitIcon = null,
  iconSize = 18,
  className = ''
}) => {
  const hasText = (inputValue || '').trim();

  const handleClick = () => {
    if (hasText) {
      onSubmit?.({ preventDefault: () => {} });
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

ChatSubmitButton.propTypes = {
  inputValue: PropTypes.string,
  isVoiceRecording: PropTypes.bool,
  isVoiceProcessing: PropTypes.bool,
  onSubmit: PropTypes.func,
  startRecording: PropTypes.func,
  stopRecording: PropTypes.func,
  disabled: PropTypes.bool,
  submitIcon: PropTypes.node,
  iconSize: PropTypes.number,
  className: PropTypes.string
};

export default ChatSubmitButton;
