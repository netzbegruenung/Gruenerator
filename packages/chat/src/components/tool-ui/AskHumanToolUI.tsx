'use client';

import { useState, memo } from 'react';
import { MessageCircleQuestion, Check, Send } from 'lucide-react';

interface AskHumanToolUIProps {
  args: Record<string, unknown>;
  result?: unknown;
  addResult: (result: unknown) => void;
}

export const AskHumanToolUI = memo(function AskHumanToolUI({
  args,
  result,
  addResult,
}: AskHumanToolUIProps) {
  const [customInput, setCustomInput] = useState('');

  const question = (args?.question as string) || 'Wie kann ich dir helfen?';
  const options = Array.isArray(args?.options) ? (args.options as string[]) : null;

  if (result !== undefined) {
    return (
      <div className="my-2 text-sm">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1">
          <Check className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground">Klärung</span>
          <span className="text-foreground-muted">&middot;</span>
          <span className="text-foreground-muted">{String(result)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-start gap-2 mb-3">
        <MessageCircleQuestion className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-sm font-medium text-foreground">{question}</p>
      </div>

      {options && options.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => addResult(option)}
              className="px-3 py-1.5 text-sm rounded-full border border-primary/30 bg-background text-foreground hover:bg-primary/10 hover:border-primary/50 transition-colors cursor-pointer"
            >
              {option}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customInput.trim()) {
              addResult(customInput.trim());
            }
          }}
          placeholder="Oder eigene Antwort eingeben..."
          className="flex-1 px-3 py-1.5 text-sm rounded-full border border-border bg-background text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-primary/50"
        />
        <button
          onClick={() => {
            if (customInput.trim()) {
              addResult(customInput.trim());
            }
          }}
          disabled={!customInput.trim()}
          className="p-1.5 rounded-full text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});
