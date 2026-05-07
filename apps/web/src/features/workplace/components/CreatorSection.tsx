import React, { Suspense, lazy, memo, useState } from 'react';

import ModePillRow from '../../texte/components/ModePillRow';
import { DEFAULT_MODE } from '../../texte/modes';

import BildBearbeitenInner from './BildBearbeitenInner';
import BoardsInner from './BoardsInner';
import ChatInner from './ChatInner';
import DocsInner from './DocsInner';
import ImagineInner from './ImagineInner';

const EigeneTab = lazy(() => import('../../texte/tabs/EigeneTab'));

const CreatorSection: React.FC = memo(() => {
  const [mode, setMode] = useState(DEFAULT_MODE);
  const isChat = mode === 'chat';
  const isEigene = mode === 'eigene';
  const isBoards = mode === 'boards';
  const isDocs = mode === 'docs';
  const isImagine = mode === 'imagine';
  const isBildBearbeiten = mode === 'bild-bearbeiten';

  return (
    <div className="w-full flex flex-col gap-md">
      <div className="flex justify-center">
        <ModePillRow mode={mode} onModeChange={setMode} />
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
      ) : isBildBearbeiten ? (
        <BildBearbeitenInner key={mode} />
      ) : isBoards ? (
        <BoardsInner key={mode} />
      ) : isDocs ? (
        <DocsInner key={mode} />
      ) : null}
    </div>
  );
});

CreatorSection.displayName = 'CreatorSection';

export default CreatorSection;
