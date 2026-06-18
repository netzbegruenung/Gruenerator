import { AIPromptInput } from '@gruenerator/ui';
import { useVoxtralDictation } from '@gruenerator/voice';
import React, { memo, useCallback, useState } from 'react';
import { FiPlus } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import FeatureIcons from '../../../components/common/FeatureIcons';
import { useBoardsTyped } from '../../../hooks/useBoardsTyped';
import useUserDefaults from '../../../hooks/useUserDefaults';
import { MODE_MAP } from '../creator/modes';

const BOARD_MODE_ID = 'boards';

const BoardsInner: React.FC = memo(() => {
  const [prompt, setPrompt] = useState('');
  const navigate = useNavigate();
  const { generateBoard, createBoard } = useBoardsTyped();
  const def = MODE_MAP[BOARD_MODE_ID];
  // AI board generation is expert-only. Non-experts get a plain "empty board" path
  // and can enable the assistant via the Expert*innenmodus toggle inside a board.
  const { get: getBoardsDefault } = useUserDefaults<boolean>('boards');
  const expertMode = getBoardsDefault('expertMode', false);

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || generateBoard.isPending) return;

    generateBoard.mutate(trimmed, {
      onSuccess: (data) => {
        void navigate(`/boards/${data.board.id}`, {
          state: { generatedStructure: data.generatedStructure ?? undefined },
        });
      },
    });
  }, [prompt, generateBoard, navigate]);

  const onSubmit = useCallback(() => void handleSubmit(), [handleSubmit]);

  const handleCreateEmpty = useCallback(() => {
    if (createBoard.isPending) return;
    createBoard.mutate(
      { title: 'Neues Board', boardType: 'kanban' },
      {
        onSuccess: (board) => {
          void navigate(`/boards/${board.id}`);
        },
      }
    );
  }, [createBoard, navigate]);

  if (!expertMode) {
    return (
      <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-sm text-center">
        <button
          onClick={handleCreateEmpty}
          disabled={createBoard.isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg border-none cursor-pointer transition-all bg-primary-600 text-white hover:bg-primary-700 shadow-sm disabled:opacity-60"
        >
          {createBoard.isPending ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <FiPlus size={16} />
          )}
          Neues Board erstellen
        </button>
        <p className="text-xs text-grey-400">
          KI-Board-Generierung ist im Expert*innenmodus verfügbar (im Board oben rechts
          aktivierbar).
        </p>
      </div>
    );
  }

  return (
    <AIPromptInput
      useDictation={useVoxtralDictation}
      value={prompt}
      onChange={setPrompt}
      onSubmit={onSubmit}
      isLoading={generateBoard.isPending}
      placeholder={def?.placeholder ?? 'Beschreibe, was du planen möchtest...'}
      examples={def?.examples}
      toolbar={<FeatureIcons noBorder />}
    />
  );
});

BoardsInner.displayName = 'BoardsInner';

export default BoardsInner;
