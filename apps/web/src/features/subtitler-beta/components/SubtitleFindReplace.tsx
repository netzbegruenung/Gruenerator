import { Button } from '@gruenerator/ui';
import { ChevronDown, ChevronUp, Replace, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useChunks, useUpdateChunkText } from '../stores/historyStore';

import { cn } from '@/utils/cn';

interface SubtitleFindReplaceProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SubtitleFindReplace({ isOpen, onClose }: SubtitleFindReplaceProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const chunks = useChunks();
  const updateChunkText = useUpdateChunkText();

  const matches = useMemo(() => {
    if (!findText) return [];
    const results: { chunkId: string; chunkText: string }[] = [];
    const search = caseSensitive ? findText : findText.toLowerCase();

    for (const chunk of chunks) {
      if (chunk.deleted) continue;
      const text = caseSensitive ? chunk.text : chunk.text.toLowerCase();
      if (text.includes(search)) {
        results.push({ chunkId: chunk.id, chunkText: chunk.text });
      }
    }
    return results;
  }, [chunks, findText, caseSensitive]);

  const handleReplaceCurrent = useCallback(() => {
    if (matches.length === 0 || !findText) return;
    const match = matches[currentMatchIndex % matches.length];
    if (!match) return;

    const regex = new RegExp(
      findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      caseSensitive ? '' : 'i'
    );
    updateChunkText(match.chunkId, match.chunkText.replace(regex, replaceText));

    if (currentMatchIndex >= matches.length - 1) {
      setCurrentMatchIndex(0);
    }
  }, [matches, currentMatchIndex, findText, replaceText, caseSensitive, updateChunkText]);

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0 || !findText) return;
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

    for (const match of matches) {
      const newText = match.chunkText.replace(regex, replaceText);
      updateChunkText(match.chunkId, newText);
    }
    setCurrentMatchIndex(0);
  }, [matches, findText, replaceText, caseSensitive, updateChunkText]);

  const handlePrev = () => {
    setCurrentMatchIndex((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
  };

  const handleNext = () => {
    setCurrentMatchIndex((prev) => (prev < matches.length - 1 ? prev + 1 : 0));
  };

  if (!isOpen) return null;

  return (
    <div className="border-b border-grey-200 bg-grey-50 px-sm py-xs dark:border-grey-700 dark:bg-grey-900/50">
      {/* Find row */}
      <div className="flex items-center gap-xs">
        <input
          type="text"
          placeholder="Suchen..."
          value={findText}
          onChange={(e) => {
            setFindText(e.target.value);
            setCurrentMatchIndex(0);
          }}
          className="flex-1 rounded border border-grey-200 bg-background px-sm py-xs text-sm focus:border-primary-400 focus:outline-none dark:border-grey-700"
          autoFocus
        />
        <span className="min-w-[4rem] text-center text-xs text-grey-500">
          {findText ? `${matches.length > 0 ? currentMatchIndex + 1 : 0} / ${matches.length}` : ''}
        </span>
        <button
          onClick={handlePrev}
          disabled={matches.length === 0}
          className="rounded p-1 hover:bg-grey-200 disabled:opacity-30 dark:hover:bg-grey-700"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleNext}
          disabled={matches.length === 0}
          className="rounded p-1 hover:bg-grey-200 disabled:opacity-30 dark:hover:bg-grey-700"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setCaseSensitive(!caseSensitive)}
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors',
            caseSensitive
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
              : 'text-grey-400 hover:bg-grey-200 dark:hover:bg-grey-700'
          )}
          title="Groß-/Kleinschreibung"
        >
          Aa
        </button>
        <button
          onClick={onClose}
          className="rounded p-1 text-grey-400 hover:bg-grey-200 dark:hover:bg-grey-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Replace row */}
      <div className="mt-xs flex items-center gap-xs">
        <input
          type="text"
          placeholder="Ersetzen..."
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          className="flex-1 rounded border border-grey-200 bg-background px-sm py-xs text-sm focus:border-primary-400 focus:outline-none dark:border-grey-700"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleReplaceCurrent}
          disabled={matches.length === 0}
          className="h-7 text-xs"
        >
          Ersetzen
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReplaceAll}
          disabled={matches.length === 0}
          className="h-7 text-xs"
        >
          Alle
        </Button>
      </div>
    </div>
  );
}
