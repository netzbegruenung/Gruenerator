import { AIPromptInput } from '@gruenerator/ui';
import React, { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import FeatureIcons from '../../../components/common/FeatureIcons';
import { useBoards } from '../../boards/hooks/useBoards';
import { MODE_MAP } from '../../texte/modes';

const BOARD_MODE_ID = 'boards';

const BoardsInner: React.FC = memo(() => {
  const [prompt, setPrompt] = useState('');
  const navigate = useNavigate();
  const { generateBoard } = useBoards();
  const def = MODE_MAP[BOARD_MODE_ID];

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || generateBoard.isPending) return;

    generateBoard.mutate(trimmed, {
      onSuccess: (data) => {
        navigate(`/boards/${data.board.id}`, {
          state: { generatedStructure: data.generatedStructure ?? undefined },
        });
      },
    });
  }, [prompt, generateBoard, navigate]);

  const onSubmit = useCallback(() => void handleSubmit(), [handleSubmit]);

  return (
    <AIPromptInput
      value={prompt}
      onChange={setPrompt}
      onSubmit={onSubmit}
      isLoading={generateBoard.isPending}
      placeholder={def?.placeholder ?? 'Beschreibe, was du planen möchtest...'}
      examples={def?.examples}
      toolbar={<FeatureIcons attachedFiles={[]} noBorder />}
    />
  );
});

BoardsInner.displayName = 'BoardsInner';

export default BoardsInner;
