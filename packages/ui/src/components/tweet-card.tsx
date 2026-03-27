import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export interface TweetCardProps {
  text: string;
  hashtags: string[];
  topicLabel: string;
  topicColor: string;
  authorName?: string;
  authorHandle?: string;
  authorAvatar?: string;
  maxChars?: number;
}

export function TweetCard({
  text,
  hashtags,
  topicLabel,
  topicColor,
  authorName = 'Bündnis 90/Die Grünen',
  authorHandle = '@Die_Gruenen',
  authorAvatar = 'B90',
  maxChars = 280,
}: TweetCardProps) {
  const [copied, setCopied] = useState(false);
  const charCount = text.length;

  const handleCopy = async () => {
    const fullText =
      hashtags.length > 0 ? `${text}\n\n${hashtags.map((h) => `#${h}`).join(' ')}` : text;
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative flex flex-col gap-md overflow-hidden rounded-xl border border-grey-200 dark:border-grey-700 p-lg bg-background">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-sm">
          <div className="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">{authorAvatar}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground m-0 leading-tight">{authorName}</p>
            <p className="text-xs text-grey-400 m-0">{authorHandle}</p>
          </div>
        </div>
        <XIcon className="h-5 w-5 text-grey-300" />
      </div>

      <p className="text-[15px] leading-relaxed text-foreground m-0 flex-1">
        {text}
        {hashtags.length > 0 && (
          <span className="text-primary-500"> {hashtags.map((h) => `#${h}`).join(' ')}</span>
        )}
      </p>

      <div className="flex items-center justify-between pt-sm border-t border-grey-100 dark:border-grey-800">
        <div className="flex items-center gap-sm">
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ color: topicColor, backgroundColor: `${topicColor}15` }}
          >
            {topicLabel}
          </span>
          <span
            className={`text-[10px] tabular-nums ${charCount > maxChars - 20 ? 'text-red-500' : 'text-grey-400'}`}
          >
            {charCount}/{maxChars}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-xs text-grey-400 hover:text-foreground transition-colors border-none bg-transparent cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Kopiert
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Kopieren
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export { XIcon as TweetXIcon };
