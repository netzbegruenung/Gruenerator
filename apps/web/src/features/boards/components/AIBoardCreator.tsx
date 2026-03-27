import { useCallback, useState } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { useBoards } from '../hooks/useBoards';

import type { BoardType } from '../types';

import { cn } from '@/utils/cn';

const EXAMPLE_PROMPTS = [
  { label: 'Wahlkampf', text: 'Wahlkampf für die Kommunalwahl planen' },
  { label: 'Veranstaltung', text: 'Eine Mitgliederversammlung organisieren' },
  { label: 'Social Media', text: 'Social-Media-Kampagne zum Klimaschutz' },
  { label: 'Website', text: 'Website-Relaunch koordinieren' },
];

export function AIBoardCreator() {
  const [description, setDescription] = useState('');
  const [boardType, setBoardType] = useState<BoardType>('kanban');
  const navigate = useNavigate();
  const { generateBoard, createBoard } = useBoards();

  const isLoading = generateBoard.isPending || createBoard.isPending;

  const handleGenerate = useCallback(() => {
    const trimmed = description.trim();
    if (!trimmed || isLoading) return;

    generateBoard.mutate(trimmed, {
      onSuccess: (data) => {
        navigate(`/boards/${data.board.id}`, {
          state: { generatedStructure: data.generatedStructure ?? undefined },
        });
      },
    });
  }, [description, isLoading, generateBoard, navigate]);

  const handleCreateEmpty = useCallback(() => {
    if (isLoading) return;
    const title = boardType === 'whiteboard' ? 'Neues Whiteboard' : 'Neues Board';
    createBoard.mutate(
      { title, boardType },
      {
        onSuccess: (board) => {
          navigate(`/boards/${board.id}`);
        },
      }
    );
  }, [isLoading, createBoard, navigate, boardType]);

  const handleExampleClick = useCallback((text: string) => {
    setDescription(text);
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto mb-xl">
      <div className="flex gap-1 p-1 mb-md bg-grey-100 dark:bg-grey-800 rounded-lg w-fit mx-auto">
        <button
          type="button"
          onClick={() => setBoardType('kanban')}
          className={cn(
            'px-4 py-1.5 text-sm font-medium rounded-md transition-all border-none cursor-pointer',
            boardType === 'kanban'
              ? 'bg-background-pure text-foreground shadow-sm'
              : 'bg-transparent text-grey-500 hover:text-foreground'
          )}
        >
          Kanban
        </button>
        <button
          type="button"
          onClick={() => setBoardType('whiteboard')}
          className={cn(
            'px-4 py-1.5 text-sm font-medium rounded-md transition-all border-none cursor-pointer',
            boardType === 'whiteboard'
              ? 'bg-background-pure text-foreground shadow-sm'
              : 'bg-transparent text-grey-500 hover:text-foreground'
          )}
        >
          Whiteboard
        </button>
      </div>

      {boardType === 'kanban' ? (
        <>
          <div className="relative">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="Was möchtest du planen?"
              rows={3}
              disabled={isLoading}
              className="w-full rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure px-4 py-3 pr-14 text-base outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 resize-none placeholder:text-grey-400 leading-relaxed shadow-sm transition-shadow focus:shadow-md"
            />
            <button
              onClick={handleGenerate}
              disabled={isLoading || description.trim().length < 3}
              className={cn(
                'absolute right-3 bottom-3 flex items-center justify-center w-8 h-8 rounded-lg transition-all border-none cursor-pointer',
                description.trim().length >= 3
                  ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
                  : 'bg-grey-100 dark:bg-grey-800 text-grey-400 cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <FiArrowRight size={16} />
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                onClick={() => handleExampleClick(prompt.text)}
                disabled={isLoading}
                className={cn(
                  'rounded-full border border-grey-200 dark:border-grey-700 px-3 py-1.5 text-xs text-grey-500 transition-all',
                  'hover:border-grey-300 dark:hover:border-grey-600 hover:text-foreground hover:bg-grey-50 dark:hover:bg-[#2a2a2a]'
                )}
              >
                {prompt.label}
              </button>
            ))}
            <span className="text-grey-300 dark:text-grey-600 mx-1">|</span>
            <button
              onClick={handleCreateEmpty}
              disabled={isLoading}
              className="text-xs text-grey-400 hover:text-foreground bg-transparent border-none cursor-pointer transition-colors p-0"
            >
              Leeres Board erstellen
            </button>
          </div>
        </>
      ) : (
        <div className="text-center">
          <p className="text-sm text-grey-500 mb-md">
            Kollaboratives Whiteboard zum Zeichnen, Skizzieren und Brainstormen.
          </p>
          <button
            onClick={handleCreateEmpty}
            disabled={isLoading}
            className={cn(
              'px-5 py-2.5 text-sm font-medium rounded-lg border-none cursor-pointer transition-all',
              'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
            )}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Erstellen...
              </span>
            ) : (
              'Neues Whiteboard erstellen'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
