import React, { Suspense, lazy, memo, useState } from 'react';

import ModePillRow from '../../texte/components/ModePillRow';
import { DEFAULT_MODE } from '../../texte/modes';

import ChatInner from './ChatInner';

// Chat is the default tab (DEFAULT_MODE) and must paint instantly, so it stays
// eager. The other tabs are lazy — their heavy deps (image-studio, @gruenerator/docs,
// boards) stay out of the initial chunk until the user switches tabs.
const BilderInner = lazy(() => import('./BilderInner'));
const BoardsInner = lazy(() => import('./BoardsInner'));
const DocsInner = lazy(() => import('./DocsInner'));

const CreatorSection: React.FC = memo(() => {
  const [mode, setMode] = useState(DEFAULT_MODE);
  const isChat = mode === 'chat';
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
      ) : (
        <Suspense
          fallback={
            <div className="flex justify-center py-xl">
              <div className="loading-spinner" />
            </div>
          }
        >
          {isBilder ? (
            <BilderInner key={mode} />
          ) : isBoards ? (
            <BoardsInner key={mode} />
          ) : isDocs ? (
            <DocsInner key={mode} />
          ) : null}
        </Suspense>
      )}
    </div>
  );
});

CreatorSection.displayName = 'CreatorSection';

export default CreatorSection;
