import React from 'react';

interface StreamingProgressProps {
  stage: string;
  message: string;
}

const StreamingProgress: React.FC<StreamingProgressProps> = ({ stage, message }) => {
  if (!message) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-grey-500">
      <span className="size-2 rounded-full bg-[var(--primary-green,#46962b)] animate-streaming-pulse" />
      <span className="italic">{message}</span>
    </div>
  );
};

export default StreamingProgress;
