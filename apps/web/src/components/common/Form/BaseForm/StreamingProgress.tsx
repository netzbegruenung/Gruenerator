import React from 'react';

interface StreamingProgressProps {
  stage: string;
  message: string;
}

const StreamingProgress: React.FC<StreamingProgressProps> = ({ stage, message }) => {
  if (!message) return null;

  return (
    <div className="streaming-progress">
      <span className="streaming-progress__dot" />
      <span className="streaming-progress__message">{message}</span>
    </div>
  );
};

export default StreamingProgress;
