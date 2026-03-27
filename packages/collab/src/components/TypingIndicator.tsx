interface TypingIndicatorProps {
  names?: string[];
}

export function TypingIndicator({ names }: TypingIndicatorProps) {
  const label = names?.length
    ? names.length === 1
      ? `${names[0]} tippt...`
      : `${names.slice(0, 2).join(', ')} tippen...`
    : null;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-grey-400">
      <div className="flex gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-grey-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-grey-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-grey-400 animate-bounce [animation-delay:300ms]" />
      </div>
      {label && <span>{label}</span>}
    </div>
  );
}
