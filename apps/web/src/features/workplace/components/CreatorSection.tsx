import React, { Suspense, lazy, memo, useState } from 'react';

import ModePillRow from '../../texte/components/ModePillRow';
import { DEFAULT_MODE } from '../../texte/modes';

import BilderInner from './BilderInner';
import BoardsInner from './BoardsInner';
import ChatInner from './ChatInner';
import DocsInner from './DocsInner';

const EigeneTab = lazy(() => import('../../texte/tabs/EigeneTab'));

const CreatorSection: React.FC = memo(() => {
  const [mode, setMode] = useState(DEFAULT_MODE);
  const isChat = mode === 'chat';
  const isEigene = mode === 'eigene';
  const isBoards = mode === 'boards';
  const isDocs = mode === 'docs';
  const isBilder = mode === 'bilder';

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
      ) : isBilder ? (
        <BilderInner key={mode} />
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
