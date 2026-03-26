import React, { Suspense, lazy, memo } from 'react';

import GeneratorInner from '../../texte/components/GeneratorInner';
import ModePillRow from '../../texte/components/ModePillRow';
import PresseSocialInner from '../../texte/components/PresseSocialInner';
import { MODE_MAP } from '../../texte/modes';

import BoardsInner from './BoardsInner';
import ChatInner from './ChatInner';
import ImagineInner from './ImagineInner';

const EigeneTab = lazy(() => import('../../texte/tabs/EigeneTab'));

interface CreatorSectionProps {
  mode: string;
  onModeChange: (mode: string) => void;
}

const CreatorSection: React.FC<CreatorSectionProps> = memo(({ mode, onModeChange }) => {
  const def = MODE_MAP[mode];
  const isChat = mode === 'chat';
  const isEigene = mode === 'eigene';
  const isBoards = mode === 'boards';
  const isImagine = mode === 'imagine';

  return (
    <div className="w-full flex flex-col gap-md">
      <div className="flex justify-center">
        <ModePillRow mode={mode} onModeChange={onModeChange} />
      </div>

      {isChat ? (
        <ChatInner />
      ) : isEigene ? (
        <Suspense
          fallback={
            <div className="flex justify-center py-xl">
              <div className="loading-spinner" />
            </div>
          }
        >
          <EigeneTab />
        </Suspense>
      ) : isImagine ? (
        <ImagineInner key={mode} />
      ) : isBoards ? (
        <BoardsInner key={mode} />
      ) : def ? (
        def.useCustomSubmit ? (
          <PresseSocialInner key={mode} def={def} />
        ) : (
          <GeneratorInner key={mode} def={def} />
        )
      ) : null}
    </div>
  );
});

CreatorSection.displayName = 'CreatorSection';

export default CreatorSection;
